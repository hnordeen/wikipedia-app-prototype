// import { DONATION_URL } from "../constants"; // This path was incorrect
const DONATION_URL = "https://donate.wikimedia.org/w/index.php?title=Special:LandingPage&country=US&uselang=en&wmf_medium=spontaneous&wmf_source=fr-redir&wmf_campaign=spontaneous"; // Define it here

export const REMINDER_SETTINGS_KEY = 'wikipediaAppDonationReminderSettings';
export const SNOOZE_ARTICLE_COUNT = 2;

// Ensure this interface is exported
export interface ReminderSettings {
  amount: string;
  frequency: string;
  articlesViewedSinceReminderSet: number;
  reminderEnabled: boolean;
}

// Helper to get settings from localStorage
export const getSettings = (): ReminderSettings | null => {
  const settingsStr = localStorage.getItem(REMINDER_SETTINGS_KEY);
  if (settingsStr) {
    try {
      return JSON.parse(settingsStr) as ReminderSettings;
    } catch (e) {
      console.error("Error parsing reminder settings from localStorage", e);
      return null;
    }
  }
  return null;
};

// Helper to save settings to localStorage - ensure this is exported
export const saveSettings = (settings: ReminderSettings): void => {
  try {
    localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("Error saving reminder settings to localStorage", error);
  }
};

export const incrementArticleViewCount = (): void => {
  const settings = getSettings();
  if (settings && settings.reminderEnabled) {
    settings.articlesViewedSinceReminderSet += 1;
    saveSettings(settings);
    console.log(`REMINDER_SERVICE: Article view count incremented to ${settings.articlesViewedSinceReminderSet}`);
  }
};

export const checkShouldShowReminder = (): { show: boolean; amount?: string; frequency?: string; url?: string, displayFrequency?: string } => {
  const settings = getSettings();
  if (settings && settings.reminderEnabled) {
    const freqNum = parseInt(settings.frequency, 10);
    if (!isNaN(freqNum) && settings.articlesViewedSinceReminderSet >= freqNum) {
      return { 
        show: true, 
        amount: settings.amount, 
        frequency: settings.frequency, 
        url: DONATION_URL,
        displayFrequency: settings.frequency
      };
    }
  }
  return { show: false };
};

// Resets counter fully to 0 (e.g., after donation or explicit close)
export const resetReminderCounter = (): void => {
  const settings = getSettings();
  if (settings) {
    settings.articlesViewedSinceReminderSet = 0;
    saveSettings(settings);
    console.log("REMINDER_SERVICE: Reminder counter fully reset to 0.");
  }
};

// Snoozes reminder to show again after SNOOZE_ARTICLE_COUNT more articles
export const snoozeReminder = (): void => {
  const settings = getSettings();
  if (settings && settings.reminderEnabled) {
    const frequencyNum = parseInt(settings.frequency, 10);
    if (!isNaN(frequencyNum)) {
      const snoozedCount = Math.max(0, frequencyNum - SNOOZE_ARTICLE_COUNT);
      saveSettings({ ...settings, articlesViewedSinceReminderSet: snoozedCount });
      console.log(`REMINDER_SERVICE: Snoozed. Counter set to ${snoozedCount} (frequency: ${frequencyNum})`);
    } else {
      console.warn("REMINDER_SERVICE: Cannot snooze, frequency is not a number.");
    }
  } else {
    console.log("REMINDER_SERVICE: Cannot snooze, reminders not enabled or no settings.");
  }
};

export const disableReminder = (): void => {
  const settings = getSettings();
  if (settings) {
    settings.reminderEnabled = false;
    // Optionally reset other fields or just disable
    saveSettings(settings);
    console.log("REMINDER_SERVICE: Reminder disabled.");
  }
};

export const getReminderStatus = (): ReminderSettings | null => {
    return getSettings();
} 