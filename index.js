require("dotenv").config();
const { WakaTimeClient, RANGE } = require("wakatime-client");
const Octokit = require("@octokit/rest");

const {
  GIST_ID: gistId,
  GH_TOKEN: githubToken,
  WAKATIME_API_KEY: wakatimeApiKey
} = process.env;

const wakatime = new WakaTimeClient(wakatimeApiKey);

const octokit = new Octokit({ auth: `token ${githubToken}` });

async function main() {
  //   const stats = await wakatime.getMyStats({ range: RANGE.LAST_7_DAYS });
  const myGoals = await wakatime.getMyGoals();
  let goalData = [];
  try {
    goalData = myGoals.data[0].chart_data;
  } catch (err) {
    console.log('err', err, myGoals);
  }
  await updateGist(goalData);
}

function trimRightStr(str, len) {
  // Ellipsis takes 3 positions, so the index of substring is 0 to total length - 3.
  return str.length > len ? str.substring(0, len - 3) + "..." : str;
}

async function updateGist(stats) {
  let gist;
  let data = {};
  try {
    gist = await octokit.gists.get({ gist_id: gistId });
    const prevData = JSON.parse((gist.data.files['weeklyCodingTimeData'] || {}).content || '{}');
    stats.forEach(({ actual_seconds, actual_seconds_text, range={} }) => {
      const { start, end } = range;
      if (!prevData[start]) {
        prevData[start] = {
          start,
          end,
          actual_seconds,
          actual_seconds_text
        }
      }
    });
    data = prevData;
  } catch (error) {
    console.error(`Unable to get gist\n${error}`);
  }

  const lines = Object.keys(data).sort((a, b) => new Date(b) - new Date(a)).map(k => {
    const { start, end, actual_seconds, actual_seconds_text } = data[k];
    const startText = (new Date(start)).toString().slice(4, 10);
    const endText   = (new Date(end)).toString().slice(4, 10);
    const completeness = actual_seconds * 100 / 72000;
    return [
      `${startText}-${endText}`,
      generateBarChart(completeness, 21),
      actual_seconds_text
    ].join(" ");
  })

  if (lines.length == 0) return;

  try {
    // Get original filename to update that same file
    await octokit.gists.update({
      gist_id: gistId,
      files: {
        weeklyCodingTimeShow: {
          filename: 'weeklyCodingTimeShow',
          content: lines.join("\n")
        },
        weeklyCodingTimeData: {
          filename: 'weeklyCodingTimeData',
          content: JSON.stringify(data)
        }
      }
    });
  } catch (error) {
    console.error(`Unable to update gist\n${error}`);
  }
}

function generateBarChart(percent, size) {
  const syms = "░▏▎▍▌▋▊▉█";

  const frac = Math.floor((size * 8 * percent) / 100);
  const barsFull = Math.floor(frac / 8);
  if (barsFull >= size) {
    return syms.substring(8, 9).repeat(size);
  }
  const semi = frac % 8;

  return [syms.substring(8, 9).repeat(barsFull), syms.substring(semi, semi + 1)]
    .join("")
    .padEnd(size, syms.substring(0, 1));
}

(async () => {
  await main();
})();
