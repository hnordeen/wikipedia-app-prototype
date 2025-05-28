import React, { useState, useEffect } from 'react';
import './MainSettingsModal.css';
import {
  getReminderStatus,
  saveSettings,
  disableReminder,
  ReminderSettings, // Assuming ReminderSettings is exported or defined here too
  // REMINDER_SETTINGS_KEY is used internally by service, not directly needed here for now
} from '../services/reminderService';
import SettingsModal, { FeedSettings } from './SettingsModal'; // Import FeedSettings type

interface MainSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  feedSettings: FeedSettings; // Pass existing feed settings down
  onFeedSettingsChange: (newSettings: FeedSettings) => void; // Pass handler down
}

// Default reminder values, might be useful if no settings are found
const DEFAULT_DONATION_AMOUNT = '2.75';
const DEFAULT_DONATION_FREQUENCY = '100';
const LAST_INITIAL_PROMPT_COUNT_KEY = 'wikipediaAppLastInitialPromptArticleCount'; // New Key
// New key for the explicit setting to show/hide the first-time prompt
const SHOW_INITIAL_DONATION_PROMPT_SETTING_KEY = 'wikipediaAppShowInitialDonationPrompt'; 

type ModalView = 'main' | 'feedSettings';

const MainSettingsModal: React.FC<MainSettingsModalProps> = ({
  isOpen,
  onClose,
  feedSettings,
  onFeedSettingsChange,
}) => {
  const [currentView, setCurrentView] = useState<ModalView>('main');
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(true);
  const [donationAmount, setDonationAmount] = useState<string>(DEFAULT_DONATION_AMOUNT);
  const [articleFrequency, setArticleFrequency] = useState<string>(DEFAULT_DONATION_FREQUENCY);
  const [initialSettingsLoaded, setInitialSettingsLoaded] = useState<boolean>(false);
  // New state for the "Allow First-Time Setup Prompt" toggle
  const [allowInitialPrompt, setAllowInitialPrompt] = useState<boolean>(() => {
    try {
      const storedValue = localStorage.getItem(SHOW_INITIAL_DONATION_PROMPT_SETTING_KEY);
      return storedValue ? JSON.parse(storedValue) : true; // Default to true
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (isOpen) {
      // Reset to main view when modal is re-opened
      setCurrentView('main');
      
      const currentReminderSettings = getReminderStatus();
      if (currentReminderSettings) {
        setReminderEnabled(currentReminderSettings.reminderEnabled);
        setDonationAmount(currentReminderSettings.amount || DEFAULT_DONATION_AMOUNT);
        setArticleFrequency(currentReminderSettings.frequency || DEFAULT_DONATION_FREQUENCY);
      } else {
        setReminderEnabled(true);
        setDonationAmount(DEFAULT_DONATION_AMOUNT);
        setArticleFrequency(DEFAULT_DONATION_FREQUENCY);
      }
      // Load the 'allowInitialPrompt' setting from localStorage each time modal opens, in case it changed elsewhere
      try {
        const storedValue = localStorage.getItem(SHOW_INITIAL_DONATION_PROMPT_SETTING_KEY);
        setAllowInitialPrompt(storedValue ? JSON.parse(storedValue) : true);
      } catch {
        setAllowInitialPrompt(true);
      }
      setInitialSettingsLoaded(true);
    } else {
      // Reset loaded flag when modal is closed so it re-fetches on next open
      setInitialSettingsLoaded(false);
    }
  }, [isOpen]);

  const handleToggleGlobalReminder = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setReminderEnabled(isChecked);
    const currentSettings = getReminderStatus();
    
    const baseSettings: Pick<ReminderSettings, 'amount' | 'frequency' | 'articlesViewedSinceReminderSet'> = 
      currentSettings 
      ? { amount: currentSettings.amount, frequency: currentSettings.frequency, articlesViewedSinceReminderSet: currentSettings.articlesViewedSinceReminderSet }
      : { amount: donationAmount, frequency: articleFrequency, articlesViewedSinceReminderSet: 0 }; 

    const newSettings: ReminderSettings = {
      ...baseSettings,
      reminderEnabled: isChecked,
      amount: baseSettings.amount || DEFAULT_DONATION_AMOUNT,
      frequency: baseSettings.frequency || DEFAULT_DONATION_FREQUENCY,
    };

    saveSettings(newSettings);

    // If global reminders are disabled, the concept of the 'initial prompt' being allowed is moot, so turn it off too.
    // If global reminders are enabled, this doesn't automatically re-enable the 'allow initial prompt' setting; that's separate.
    if (!isChecked) {
      setAllowInitialPrompt(false);
      try {
        localStorage.setItem(SHOW_INITIAL_DONATION_PROMPT_SETTING_KEY, JSON.stringify(false));
      } catch (error) {
        console.error("Error saving show initial prompt setting (on global disable):", error);
      }
    }
    // Also, reset the 100-article counter when global reminders are toggled
    try {
      localStorage.removeItem(LAST_INITIAL_PROMPT_COUNT_KEY);
    } catch (error) {
      console.error("Error clearing last initial prompt article count (on global toggle):", error);
    }
  };

  const handleToggleAllowInitialPrompt = (e: React.ChangeEvent<HTMLInputElement>) => {
    const isChecked = e.target.checked;
    setAllowInitialPrompt(isChecked);
    try {
      localStorage.setItem(SHOW_INITIAL_DONATION_PROMPT_SETTING_KEY, JSON.stringify(isChecked));
      if (isChecked) {
        // If user explicitly turns ON "Allow First-Time Setup Prompt", reset the 100-article counter
        // to make them eligible for it sooner on HistoryPage (respecting other conditions).
        localStorage.removeItem(LAST_INITIAL_PROMPT_COUNT_KEY);
        console.log("MAIN_SETTINGS_MODAL: Cleared last initial prompt article count because 'Allow First-Time Prompt' was enabled.");
      }
    } catch (error) {
      console.error("Error saving/clearing prompt settings:", error);
    }
  };

  const handleSaveDonationSettings = () => {
    const amount = parseFloat(donationAmount);
    const frequency = parseInt(articleFrequency, 10);
    if (isNaN(amount) || amount <= 0) {
      alert("Please enter a valid donation amount.");
      return;
    }
    if (isNaN(frequency) || frequency <= 0) {
      alert("Please enter a valid article frequency.");
      return;
    }

    const currentSettings = getReminderStatus();
    const newSettings: ReminderSettings = {
      // Preserve articlesViewedSinceReminderSet if it exists and we are just modifying, 
      // unless user changes frequency, then it should be 0.
      // For simplicity now, saving new settings from this modal RESETS the counter.
      articlesViewedSinceReminderSet: 0, 
      amount: donationAmount,
      frequency: articleFrequency,
      reminderEnabled: reminderEnabled, // Persist current toggle state
    };
    saveSettings(newSettings);
    alert("Donation reminder settings saved!");
    // Optionally close modal or provide other feedback
  };

  const renderMainView = () => (
    <>
      <div className="m-setting-category m-setting-category-explore">
        <h3>Explore Feed</h3>
        <button 
          className="m-setting-item-button navigate-button"
          onClick={() => setCurrentView('feedSettings')}
        >
          Customize Feed Preferences <span className="m-arrow">›</span>
        </button>
      </div>
      
      <div className="m-setting-category m-setting-category-donations">
        <h3>Donation Reminders</h3>
        <div className="m-setting-item">
          <label className="m-toggle-switch-label">
            Enable All Donation Reminders
            <input 
              type="checkbox" 
              checked={reminderEnabled} // This is for globally enabling/disabling all reminders
              onChange={handleToggleGlobalReminder} 
              className="m-toggle-switch"
            />
             <span className="m-slider round"></span>
          </label>
        </div>

        {/* New Toggle for allowing the first-time setup prompt */} 
        {reminderEnabled && ( // Only show this option if global reminders are on
          <div className="m-setting-item">
            <label className="m-toggle-switch-label">
              Always show donation set-up prompt
              <input 
                type="checkbox" 
                checked={allowInitialPrompt}
                onChange={handleToggleAllowInitialPrompt} 
                className="m-toggle-switch"
              />
              <span className="m-slider round"></span>
            </label>
          </div>
        )}

        {reminderEnabled && (
          <div className="m-donation-settings-edit">
            <p className="m-settings-description">
              Customize the reminder that appears after your first-time setup:
            </p>
            <div className="m-input-group">
              <label htmlFor="donationAmountMain">Amount ($)</label>
              <input 
                type="number" 
                id="donationAmountMain"
                value={donationAmount} 
                onChange={(e) => setDonationAmount(e.target.value)} 
                className="m-form-input"
                min="1"
                placeholder={DEFAULT_DONATION_AMOUNT}
              />
            </div>
            <div className="m-input-group">
              <label htmlFor="articleFrequencyMain">Frequency (articles)</label>
              <input 
                type="number" 
                id="articleFrequencyMain"
                value={articleFrequency} 
                onChange={(e) => setArticleFrequency(e.target.value)} 
                className="m-form-input"
                min="1"
                placeholder={DEFAULT_DONATION_FREQUENCY}
              /> 
            </div>
            <button 
              className="m-button-save-reminder"
              onClick={handleSaveDonationSettings}
            >
              Save Reminder Preferences
            </button>
          </div>
        )}
      </div>
    </>
  );

  if (!isOpen || (currentView === 'main' && !initialSettingsLoaded)) {
    return null;
  }

  return (
    <div className="m-modal-overlay">
      <div className="m-modal-content">
        {/* Main modal header (only for main view or if feed settings doesn't have its own) */} 
        {currentView === 'main' && (
            <div className="m-modal-header">
                <h2>Settings</h2>
                <button onClick={onClose} className="m-modal-close-button" aria-label="Close settings">
                    &times;
                </button>
            </div>
        )}
        
        <div className="m-modal-body">
          {currentView === 'main' && renderMainView()}
          {currentView === 'feedSettings' && (
            <SettingsModal 
              asPanel={true} 
              settings={feedSettings} 
              onSettingsChange={onFeedSettingsChange} 
              onBack={() => setCurrentView('main')} 
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default MainSettingsModal; 