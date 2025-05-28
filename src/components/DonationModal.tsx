import React, { useState, useEffect } from 'react';
import './DonationModal.css';
import { disableReminder as globallyDisableReminder } from '../services/reminderService'; // Import service function

export const REMINDER_SETTINGS_KEY = 'wikipediaAppDonationReminderSettings';

interface ReminderSettings { // This interface is also in reminderService.ts, consider a shared types file
  amount: string;
  frequency: string;
  articlesViewedSinceReminderSet: number;
  reminderEnabled: boolean;
}

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  // donationUrl: string; // No longer directly used for a link in this flow
  articleCount?: number;
}

const WIKIHEART_ICON_URL = "https://upload.wikimedia.org/wikipedia/commons/e/e9/Wikiheart.svg";

const DonationModal: React.FC<DonationModalProps> = ({ isOpen, onClose, articleCount }) => {
  const [modalStep, setModalStep] = useState<'initialPrompt' | 'setReminder' | 'confirmation'>('initialPrompt');
  const [donationAmount, setDonationAmount] = useState<string>('2.75'); // Default to 2.75
  const [articleFrequency, setArticleFrequency] = useState<string>('100'); // Default to 100

  // Reset to initial step and default values when modal is opened
  useEffect(() => {
    if (isOpen) {
      setModalStep('initialPrompt');
      // Optionally reset inputs to defaults when modal re-opens, 
      // or let them persist if user closes and re-opens in same session without saving.
      // For now, let them persist if already changed by user during current modal interaction before closing.
      // If you want strict reset every time it opens:
      // setDonationAmount('2.75');
      // setArticleFrequency('100');
    } 
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleInitialYesClick = () => {
    setModalStep('setReminder');
  };

  const handleNoThanksInitial = () => {
    globallyDisableReminder();
    onClose();
  };

  const handleSetReminderSubmit = () => {
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
    
    const reminderSettingsData: ReminderSettings = {
      amount: donationAmount,
      frequency: articleFrequency,
      articlesViewedSinceReminderSet: 0, // Initialize counter
      reminderEnabled: true,
    };
    try {
      localStorage.setItem(REMINDER_SETTINGS_KEY, JSON.stringify(reminderSettingsData));
      console.log("REMINDER_MODAL: Saved reminder settings to localStorage", reminderSettingsData);
    } catch (error) {
      console.error("REMINDER_MODAL: Error saving reminder settings to localStorage", error);
      alert("There was an issue saving your reminder settings. Please try again.");
      return; // Don't proceed to confirmation if saving failed
    }
    
    setModalStep('confirmation');
  };

  const renderInitialPrompt = () => {
    const message = articleCount && articleCount > 0 
      ? `You've visited ${articleCount} articles. Would you like to set up a donation reminder?`
      : "Would you like to set up a donation reminder?";
    return (
      <>
        <img src={WIKIHEART_ICON_URL} alt="WikiHeart icon" className="modal-header-icon" />
        <h2>Set a Reminder?</h2>
        <p>{message}</p>
        <div className="modal-button-group">
          <button 
            className="donation-modal-button-yes"
            onClick={handleInitialYesClick}
          >
            Yes
          </button>
          <button className="donation-modal-later-button" onClick={onClose}>
            Maybe Later
          </button>
        </div>
        <button className="donation-modal-no-thanks-link" onClick={handleNoThanksInitial}>
          No thanks, don't ask again
        </button>
      </>
    );
  };

  const renderSetReminderForm = () => {
    const currentAmount = donationAmount || '[Amount]';
    const currentFrequency = articleFrequency || '[Frequency]';
    return (
      <>
        <img src={WIKIHEART_ICON_URL} alt="WikiHeart icon" className="modal-header-icon" />
        <h2>Set Donation Reminder</h2>
        <div className="form-inputs-container">
          <div className="input-group amount-input-group">
            <span className="input-addon">$</span>
            <input 
              type="number" 
              value={donationAmount} 
              onChange={(e) => setDonationAmount(e.target.value)} 
              className="donation-input"
              placeholder="Amount"
              min="1"
            />
          </div>
          <div className="input-group frequency-input-group">
            <input 
              type="number" 
              value={articleFrequency} 
              onChange={(e) => setArticleFrequency(e.target.value)} 
              className="donation-input"
              placeholder="Articles"
              min="1"
            /> 
            <span className="input-addon">articles</span>
          </div>
        </div>
        <p className="dynamic-reminder-preview-text">
          {`You will be reminded to donate $${currentAmount} every ${currentFrequency} articles.`}
        </p>
        <button 
          className="donation-modal-button-confirm" 
          onClick={handleSetReminderSubmit}
        >
          Set Reminder
        </button>
        <button className="donation-modal-back-button" onClick={() => setModalStep('initialPrompt')}>
          Back
        </button>
      </>
    );
  };

  const renderConfirmation = () => {
    return (
      <>
        <img src={WIKIHEART_ICON_URL} alt="WikiHeart icon" className="modal-header-icon" />
        <h2>Reminder Set!</h2>
        <p>
          Ok, we'll remind you to donate ${donationAmount} every ${articleFrequency} articles!
        </p>
        <button className="donation-modal-button-confirm" onClick={onClose}>
          Got it!
        </button>
      </>
    );
  };

  return (
    <div className="donation-modal-overlay">
      <div className="donation-modal-content">
        <button className="donation-modal-close" onClick={onClose}>&times;</button>
        {modalStep === 'initialPrompt' && renderInitialPrompt()}
        {modalStep === 'setReminder' && renderSetReminderForm()}
        {modalStep === 'confirmation' && renderConfirmation()}
      </div>
    </div>
  );
};

export default DonationModal; 