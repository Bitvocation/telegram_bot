/* eslint-disable max-len */
import { createClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import * as dotenv from "dotenv";
import { SendMessageOptions } from "node-telegram-bot-api";
import { utmParams } from "./constants";

dotenv.config();

/** Replace `$placeholders` for the actual values of the variables.
 * @example formatVariables("Hello, $username.", { username: "john" }) // "Hello, john."
 * @param {string} input - The unformatted string.
 * @param {{ username?: string, command?: string }} optionalParameters -
 * The `username` or the `command` variables.
 * @returns {string} The formatted string.
 */
export function formatVariables(
  input: string,
  optionalParameters?: {
    username?: string;
    command?: string;
  }
): string {
  return input
    .replace("$username", optionalParameters?.username || "user")
    .replace("$command", optionalParameters?.command || "command");
}

if (!process.env.SUPABASE_URL && !process.env.SUPABASE_KEY) {
  throw new Error("No Supabase URL provided.");
}
const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_KEY as string;
export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function getLatestJobs(keywords?: string[]) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 7);

    const { data: jobs, error } = await supabase
      .from("job_table")
      .select("*")
      .gte("created_at", sevenDaysAgo.toISOString())
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Error fetching latest jobs: ${error.message}`);
    }

    if (!jobs || jobs.length === 0) {
      return null;
    }

    if (!keywords) {
      return jobs;
    }
    // TODO: Filter at supabase query  (islike param)
    const filteredJobs = jobs.filter((job) =>
      keywords?.some((keyword) =>
        Object.values(job)
          .filter((value) => typeof value === "string" || Array.isArray(value))
          .map((value) => (Array.isArray(value) ? value.join(" ") : value))
          .some((value) =>
            (value as string).toLowerCase().includes(keyword.toLowerCase())
          )
      )
    );

    return filteredJobs;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export async function getKeyword(keywords?: string[]) {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const { data: jobs } = await supabase
      .from("job_table")
      .select()
      .gte("created_at", thirtyDaysAgo.toISOString())
      .lte("created_at", now.toISOString())
      .order("created_at", { ascending: false });

    if (!jobs || jobs.length === 0) {
      return null;
    }

    if (!keywords) {
      return jobs;
    }

    const filteredJobs = jobs.filter((job) =>
      keywords.some((keyword) =>
        Object.values(job)
          .filter((value) => typeof value === "string" || Array.isArray(value))
          .map((value) => (Array.isArray(value) ? value.join(" ") : value))
          .some((value) =>
            (value as string).toLowerCase().includes(keyword.toLowerCase())
          )
      )
    );

    return filteredJobs;
  } catch (error) {
    console.error(`Error in getKeyword: ${error}`);
    return null;
  }
}

export async function sendParseMessage(
  chatId: number,
  response: any,
  bot: any,
  keywords: string[]
) {
  if (response !== null && response !== undefined && response.length > 0) {
    let index = 0;
    const chunkSize = 20;

    while (index < response.length) {
      const chunk = response.slice(index, index + chunkSize);
      await sendMessagePart(chatId, chunk, bot, keywords);
      index += chunkSize;
    }
  } else {
    await bot.sendMessage(chatId, `No jobs found ${keywords}`);
  }
}

async function sendMessagePart(
  chatId: number,
  responsePart: any,
  bot: any,
  keywords: string[]
) {
  const catStrings = responsePart.map((entry: any) => {
    const url = entry.telegram_short_url || entry.url;

    let catString = `\n <a href="${url}"><b>${entry.title}</b></a>`;

    catString += `\n 📅 From the: <b>${format(
      new Date(entry.created_at),
      "dd.MM.yyyy"
    )}</b>`;

    if (entry.company) {
      catString += `\n 🏢 Company: <b>${entry.company}</b>`;
    }

    if (entry.location !== null && entry.location !== "") {
      catString += `\n 📍 Location: <b>${entry.location}</b>`;
    }
    catString += "\n";

    return catString;
  });

  const message = `${responsePart.length} Jobs ${keywords}:
        ${catStrings.join("")}`;

  if (message) {
    const options: {
      parse_mode?: "Markdown" | "HTML" | undefined;
      disable_web_page_preview?: boolean;
    } = {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    await bot.sendMessage(chatId, message, options);
  }
}

export function calculateTimeRange() {
  const now = new Date();
  const pastDayStart = new Date(now);
  pastDayStart.setHours(0, 0, 0, 0); // Set to the beginning of the day
  const pastDayEnd = new Date(now);
  pastDayEnd.setHours(23, 59, 59, 999); // Set to the end of the day

  return {
    pastDayStart,
    pastDayEnd,
  };
}

export async function fetchAndPostLatestEntries(bot: any) {
  const channelID = "-1001969684625";
  console.log("--------------------New Fetch started--------------------");
  try {
    const { pastDayStart, pastDayEnd } = calculateTimeRange();

    const { data, error } = await supabase
      .from("job_table")
      .select("*")
      .gt("created_at", pastDayStart.toISOString())
      .lt("created_at", pastDayEnd.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching data from Supabase", error.message);
    }
    if (!data || data.length === 0) {
      console.log("No data found");
      return;
    }
    console.log(`Fetched ${JSON.stringify(data)} entries from Supabase.`);

    for (const [index, entry] of data.entries()) {
      if (entry.fetched === true) {
        console.log(`Entry ${entry.id} already fetched, skipping...`);
      } else {
        // read all users chatIds from db and look at job_alerts
        // if keywords match to entry send message

        try {
          const delay = index * 50000;
          await new Promise((resolve) => setTimeout(resolve, delay));
          const jobAlertsData = await readAllJobAlerts();

          if (jobAlertsData) {
            for (const userKeywords of jobAlertsData) {
              const { user_id, job_alerts } = userKeywords;
              // Add a check to ensure job_alerts is not null before using some
              if (job_alerts && Array.isArray(job_alerts)) {
                const jobMatchesAlerts = job_alerts.some((keyword: string) => {
                  const titleContainsKeyword =
                    entry.title &&
                    entry.title.toLowerCase().includes(keyword.toLowerCase());
                  const location =
                    entry.location &&
                    entry.location
                      .toLowerCase()
                      .includes(keyword.toLowerCase());
                  const company =
                    entry.company &&
                    entry.company.toLowerCase().includes(keyword.toLowerCase());
                  const category = entry.category
                    ? entry.category
                        .toLowerCase()
                        .includes(keyword.toLowerCase())
                    : false;
                  const type = entry.type
                    ? entry.type.toLowerCase().includes(keyword.toLowerCase())
                    : false;
                  const tags = entry.tags
                    ? entry.tags.some((tag: string) =>
                        tag.toLowerCase().includes(keyword.toLowerCase())
                      )
                    : false;
                  const description = entry.description
                    ? entry.description
                        .toLowerCase()
                        .includes(keyword.toLowerCase())
                    : false;
                  return (
                    titleContainsKeyword ||
                    location ||
                    company ||
                    category ||
                    type ||
                    tags ||
                    description
                  );
                });

                if (jobMatchesAlerts) {
                  // timeout?
                  console.log(
                    `Entry: ${JSON.stringify(
                      entry.title,
                      null,
                      2
                    )} matches keyword ${JSON.stringify(userKeywords, null, 2)}`
                  );

                  await sendSingleJob(user_id, entry, bot);
                }
              }
            }
          }
          // console.log(`Entry ${entry} sent to all users`,);

          await sendSingleJob(channelID, entry, bot);
          // only when send to channel set to true.... nice
          const { data: data } = await supabase
            .from("job_table")
            .update({ fetched: true })
            .eq("id", entry.id);
        } catch (messageError) {
          console.error("Error sending message:", messageError);
        }
      }
    }
  } catch (fetchError) {
    console.error("Error fetching data:", fetchError);
  }
}

export async function createUserEntry(chatId: string) {
  // Insert a new user entry into the user_config table
  const { data, error } = await supabase
    .from("user_config")
    .insert([{ user_id: chatId }]);

  if (error) {
    console.error("Error inserting new user:", error.message);
    return null; // Handle the error as needed
  }
  return data; // Return the inserted data if needed
}
export async function readUserEntry(chatId: string) {
  const { data, error } = await supabase
    .from("user_config")
    .select()
    .eq("user_id", chatId);

  if (error) {
    console.error("Error fetching reading user data:", error.message);
    return false; // Handle the error as needed
  }
  if (data && data.length > 0) {
    return true; // User with the provided chatId exists
  }
  return false;
}
export async function readAllJobAlerts() {
  const { data: data, error } = await supabase
    .from("user_config")
    .select("user_id , job_alerts");

  if (error) {
    console.error("Error fetching all job alerts:", error.message);
    return false; // Handle the error as needed
  }
  return data;
}
export async function hasJobAlert(chatId: string) {
  const { data: data, error } = await supabase
    .from("user_config")
    .select("job_alerts")
    .eq("user_id", chatId);

  if (error) {
    console.error("Error fetching user has a job alert:", error.message);
    return false; // Handle the error as needed
  }
  // console.log('data', data);

  if (data && data.length > 0) {
    return data[0].job_alerts; // User with the provided chatId exists
  }
  return false;
}
export async function updateJobAlerts(chatId: string, newKeywords: string[]) {
  if (!newKeywords || newKeywords.length === 0) {
    return false;
  }

  try {
    const existingUserData = await supabase
      .from("user_config")
      .select("job_alerts")
      .eq("user_id", chatId);

    if (existingUserData.data && existingUserData.data.length > 0) {
      // Extract current keywords array from the result
      const currentKeywords = existingUserData.data[0].job_alerts || [];

      // Combine existing and new keywords, removing duplicates
      const combinedKeywords = [
        ...new Set([...currentKeywords, ...newKeywords]),
      ];

      const updatedUserData = await supabase
        .from("user_config")
        .update({ job_alerts: combinedKeywords })
        .eq("user_id", chatId);

      return updatedUserData;
    } else {
      console.error("No user data found for the specified user ID:", chatId);
      return false;
    }
  } catch (error) {
    console.error("Error updating user data:", error);
    return false;
  }
}
export async function deleteJobAlerts(chatId: string) {
  // see single job alerts and then choose with one to delete?
  // const allAlerts = await readAllJobAlerts();
  // const userAlerts = allAlerts?.filter((alert) => alert.user_id === chatId);
  try {
    const updatedUserData = await supabase
      .from("user_config")
      .update({ job_alerts: [] })
      .eq("user_id", chatId);

    return updatedUserData;
  } catch (error) {
    console.error("Error updating user data:", error);
    return false;
  }
}
const sendSingleJob = async (chatId: string, entry: any, bot: any) => {
  // Check if entry.url already contains query parameters
  const url = entry.telegram_short_url || entry.url;

  try {
    let message = `
              🟠  <a href="${url}"><b>${entry.title}</b></a>\n`;
    if (entry.company) {
      message += `\nCompany: <b>${entry.company}</b>`;
    }
    // if (entry.date) {
    //   message += `\nDate of Publishing: <b>${entry.date}</b>`;
    // }
    if (entry.location !== null && entry.location !== "") {
      const input = entry.location;
      const location = input.replace(/[[\]"]+/g, "");
      message += `\nLocation: <b>${location}</b>`;
    }

    if (entry.salary !== null && entry.salary !== "") {
      message += `\nSalary: <b>${entry.salary}</b>`;
    }

    if (entry.category !== null && entry.category !== "") {
      message += `\nCategory: <b>${entry.category}</b>`;
    }
    if (entry.type !== null && entry.type !== "") {
      message += `\nEmployment Type: <b>${entry.type}</b>`;
    }

    if (entry.tags !== null && entry.tags.length > 0) {
      // Replace spaces and hyphens with underscores, and make tags lowercase
      const tagElement = entry.tags
        .map(
          (tag: string) =>
            `#${tag
              .replace(/\s*\([^)]*\)\s*/g, "")
              .trim()
              .replace(/[\s-]/g, "_")
              .toLowerCase()}`
        )
        .join(" ");

      const tagsLabel = entry.tags.length === 1 ? "Tag" : "Tags";

      message += `\n\n <b>${tagsLabel}:</b> ${tagElement}`;
    }

    // const urlToUse =
    //   entry.applyURL && entry.applyURL !== ""
    //     ? entry.applyURL
    //     : entry.url;

    const inlineKeyboard = {
      inline_keyboard: [[{ text: "Learn more", url: entry.url }]],
    };

    const options: SendMessageOptions = {
      parse_mode: "HTML",
      reply_markup: inlineKeyboard,
    };

    await bot.sendMessage(chatId, message, options);
    console.log(`Message sent to ${chatId}: ${message}`);
  } catch (error) {
    console.error("Error sending job to user:", error);
  }
};

export async function handlePrivacy(chatId: number, event: boolean) {
  const { data, error } = await supabase
    .from("user_config")
    .select("privacy")
    .eq("user_id", chatId);

  if (error) {
    console.error("Error fetching user privacy data:", error.message);
    return false;
  }
  if (data && data.length > 0) {
    const privacy = data[0].privacy;
    if (event === true) {
      await supabase
        .from("user_config")
        .update({ privacy: true })
        .eq("user_id", chatId);
      // await bot.sendMessage(chatId, 'Thanks for accepting our privacy policy');
    }
    if (event === false) {
      await supabase
        .from("user_config")
        .update({ privacy: false })
        .eq("user_id", chatId);
      // await bot.sendMessage(chatId, 'Ok, no problem, if you change your mind, just type /privacy');
    }
  }
}
