import React from 'react';
import './DonationReminderPrompt.css';

interface DonationReminderPromptProps {
  isOpen: boolean;
  onClose: (action: 'donate' | 'snooze' | 'disable' | 'close') => void; // Added 'disable' action
  amount?: string;
  frequency?: string;
  donationUrl?: string;
  // articlesReadInCycle?: number; // Optional: if we want to show a running count in title
}

const WIKIHEART_ICON_URL = "https://upload.wikimedia.org/wikipedia/commons/e/e9/Wikiheart.svg";

const DonationReminderPrompt: React.FC<DonationReminderPromptProps> = ({
  isOpen,
  onClose,
  amount,
  frequency,
  donationUrl,
  // articlesReadInCycle // if added
}) => {
  if (!isOpen) {
    return null;
  }

  const handleDonateNow = () => {
    if (donationUrl) {
      window.open(donationUrl, '_blank', 'noopener,noreferrer');
    }
    onClose('donate'); // Pass 'donate' action
  };

  const handleMaybeLater = () => {
    onClose('snooze'); // Pass 'snooze' action
  };

  const handleDisable = () => {
    onClose('disable'); // Pass 'disable' action
  };

  const displayAmount = amount || 'your chosen amount';
  const displayFrequency = frequency || 'X'; // Using 'X' as a fallback for frequency
  // const articlesForTitle = articlesReadInCycle || displayFrequency; // Use this if articlesReadInCycle is passed

  return (
    <div className="drp-modal-overlay">
      <div className="drp-modal-content">
        <button className="drp-modal-button-close" onClick={handleDisable} aria-label="Disable reminders">
          &times;
        </button>
        <div className="drp-icon-and-text-wrapper">
          <img src={WIKIHEART_ICON_URL} alt="WikiHeart icon" className="drp-header-icon" />
          <div className="drp-text-content">
            <h2>{`You've read ${displayFrequency} articles!`}</h2>
            <p>
              {`You set up a reminder to donate $${displayAmount} after reading ${displayFrequency} articles. Would you like to donate now?`}
            </p>
          </div>
        </div>
        <div className="drp-button-group">
          <button 
            className="drp-modal-button-donate" 
            onClick={handleDonateNow}
            disabled={!donationUrl}
          >
            Donate ${displayAmount}
          </button>
          <button className="drp-modal-button-later" onClick={handleMaybeLater}>
            Snooze
          </button>
        </div>
      </div>
    </div>
  );
};

export default DonationReminderPrompt; 