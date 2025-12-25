import { useState } from "react";
import { useTrmnl } from "./hooks/useTrmnl";
import "./App.css";

function App() {
  const {
    state,
    isLoading,
    error,
    countdown,
    forceRefresh,
    changeDevice,
    openLogin,
    loadDevices,
    saveManualApiKey,
  } = useTrmnl();

  const { currentImage, selectedDevice, devices } = state;
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const handleSaveApiKey = () => {
    if (apiKeyInput.trim()) {
      saveManualApiKey(apiKeyInput.trim());
      setApiKeyInput("");
      setShowSettings(false);
    }
  };

  // Render login prompt if no devices and no selected device with API key
  if (devices.length === 0 && !selectedDevice && !isLoading) {
    return (
      <div className="trmnl-container">
        <div className="trmnl-error-container">
          <div className="trmnl-error-content">
            <h2>Welcome to TRMNL Web</h2>
            <p>View your TRMNL device display right in your browser.</p>

            <div className="trmnl-setup-section">
              <h3>Enter Your API Key</h3>
              <p className="trmnl-note">
                You can find your device API key in your{" "}
                <a
                  href="https://usetrmnl.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  TRMNL Dashboard
                </a>{" "}
                under Device Settings.
              </p>
              <div className="trmnl-input-group">
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
                  placeholder="Paste your device API key"
                  className="trmnl-input"
                />
                <button
                  onClick={handleSaveApiKey}
                  className="trmnl-button trmnl-button-primary"
                  disabled={!apiKeyInput.trim()}
                >
                  Connect
                </button>
              </div>
            </div>

            <div className="trmnl-divider">
              <span>or</span>
            </div>

            <div className="trmnl-setup-section">
              <p className="trmnl-note">
                If you're logged into usetrmnl.com, try loading your devices
                automatically:
              </p>
              <div className="trmnl-button-group">
                <button onClick={openLogin} className="trmnl-button">
                  Log in to TRMNL
                </button>
                <button onClick={loadDevices} className="trmnl-button">
                  Load Devices
                </button>
              </div>
            </div>

            {error && <p className="trmnl-error-message">{error}</p>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="trmnl-container">
      {/* Main Display Area */}
      <div className="trmnl-display">
        <div className="trmnl-image-container">
          {isLoading && !currentImage && (
            <div className="trmnl-loading">
              <div className="trmnl-loading-spinner"></div>
              <p>Loading TRMNL display...</p>
            </div>
          )}

          {currentImage && (
            <img
              src={currentImage.url}
              alt="TRMNL Display"
              className="trmnl-image"
            />
          )}

          {!isLoading && !currentImage && selectedDevice && (
            <div className="trmnl-no-image">
              <p>No image available</p>
              <button onClick={forceRefresh} className="trmnl-button">
                Refresh
              </button>
            </div>
          )}
        </div>

        {/* Info Overlay */}
        <div className="trmnl-info-overlay">
          <div className="trmnl-info-left">
            {devices.length > 1 ? (
              <select
                value={selectedDevice?.id || ""}
                onChange={(e) => {
                  const device = devices.find((d) => d.id === e.target.value);
                  if (device) {
                    changeDevice(device);
                    forceRefresh();
                  }
                }}
                className="trmnl-device-select"
              >
                {devices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name || device.friendly_id || device.id}
                  </option>
                ))}
              </select>
            ) : (
              <span className="trmnl-device-name">
                {selectedDevice?.name ||
                  selectedDevice?.friendly_id ||
                  "TRMNL Device"}
              </span>
            )}
          </div>

          <div className="trmnl-info-center">
            <span className="trmnl-countdown">
              Next refresh: <strong>{countdown}</strong>
            </span>
          </div>

          <div className="trmnl-info-right">
            <button
              onClick={forceRefresh}
              disabled={isLoading}
              className="trmnl-button trmnl-button-small"
              title="Refresh now"
            >
              {isLoading ? "..." : "↻"}
            </button>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="trmnl-button trmnl-button-small"
              title="Settings"
            >
              ⚙
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="trmnl-settings-panel">
            <h3>Settings</h3>

            <div className="trmnl-settings-section">
              <label>API Key</label>
              <div className="trmnl-input-group">
                <input
                  type="text"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
                  placeholder="Enter new API key"
                  className="trmnl-input"
                />
                <button
                  onClick={handleSaveApiKey}
                  className="trmnl-button trmnl-button-primary"
                  disabled={!apiKeyInput.trim()}
                >
                  Save
                </button>
              </div>
            </div>

            <div className="trmnl-settings-actions">
              <button onClick={loadDevices} className="trmnl-button">
                Reload Devices
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.reload();
                }}
                className="trmnl-button trmnl-button-danger"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error Toast */}
      {error && <div className="trmnl-toast trmnl-toast-error">{error}</div>}
    </div>
  );
}

export default App;
