// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  // Get references to the elements
  const actionButton = document.getElementById('actionButton');
  const statusElement = document.getElementById('status');
  
  function updateStatus(message, isError = false) {
    console.log(message);
    statusElement.textContent = 'Status: ' + message;
    statusElement.style.color = isError ? '#ea4335' : '#34a853';
    statusElement.style.backgroundColor = isError ? '#fde9e8' : '#f5f5f5';
  }

  function isUpworkUrl(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.includes('upwork.com');
    } catch (e) {
      console.error('Error parsing URL:', e);
      return false;
    }
  }
  
  // Add a click event listener to the button
  actionButton.addEventListener('click', function() {
    updateStatus('Button clicked, checking current tab...');
    
    // Get the current active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (chrome.runtime.lastError) {
        updateStatus('Error getting tab: ' + chrome.runtime.lastError.message, true);
        return;
      }
      
      if (!tabs || tabs.length === 0) {
        updateStatus('No active tab found', true);
        return;
      }
      
      const currentTab = tabs[0];
      console.log('Current tab:', currentTab); // Debug log
      
      if (!currentTab.url) {
        updateStatus('Tab URL is undefined. Please refresh the page.', true);
        return;
      }
      
      updateStatus('Current tab: ' + currentTab.url);
      
      // Check if we're on an Upwork site
      if (isUpworkUrl(currentTab.url)) {
        updateStatus('On Upwork site, injecting script...');
        
        try {
          // Execute the content script on the current tab
          chrome.scripting.executeScript({
            target: {tabId: currentTab.id},
            files: ['content.js']
          }).then(() => {
            updateStatus('Script injected successfully');
            actionButton.textContent = 'Script Running!';
            actionButton.style.backgroundColor = '#34a853';
            
            // Send a message to the content script
            chrome.tabs.sendMessage(currentTab.id, {action: 'runScript'}, function(response) {
              if (chrome.runtime.lastError) {
                console.log('Error sending message:', chrome.runtime.lastError);
                return;
              }
              
              if (response && response.status) {
                updateStatus('Content script responded: ' + response.status);
              }
            });
          }).catch(error => {
            updateStatus('Error injecting script: ' + error.message, true);
            actionButton.textContent = 'Error!';
            actionButton.style.backgroundColor = '#ea4335';
          });
        } catch (error) {
          updateStatus('Exception: ' + error.message, true);
        }
      } else {
        updateStatus('Not on Upwork site. Please navigate to upwork.com', true);
        actionButton.textContent = 'Not on Upwork!';
        actionButton.style.backgroundColor = '#ea4335';
      }
    });
  });
  
  // Listen for messages from the content script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    if (message.action === 'contentScriptResult') {
      updateStatus('Received result from content script: ' + message.data.message);
      actionButton.textContent = 'Script Completed!';
      sendResponse({status: 'Popup received the message'});
    }
    return true; // Keep the message channel open for async response
  });
  
  // Log that the popup has been loaded
  updateStatus('Popup loaded successfully!');
  
  // Check current tab on popup load
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
      updateStatus('Could not determine current tab', true);
      return;
    }
    
    const currentTab = tabs[0];
    console.log('Initial tab check:', currentTab); // Debug log
    
    if (!currentTab.url) {
      updateStatus('Please refresh the page to access tab information', true);
      actionButton.disabled = true;
      actionButton.textContent = 'Refresh Required';
      actionButton.style.backgroundColor = '#ea4335';
      return;
    }
    
    updateStatus('Current tab: ' + currentTab.url);
    
    if (isUpworkUrl(currentTab.url)) {
      actionButton.disabled = false;
      actionButton.textContent = 'Run on Upwork Page';
      actionButton.style.backgroundColor = '#4285f4';
    } else {
      actionButton.disabled = true;
      actionButton.textContent = 'Not on Upwork!';
      actionButton.style.backgroundColor = '#ea4335';
      updateStatus('Please navigate to an Upwork site to use this extension', true);
    }
  });
});

// This function will be injected into the page
function interactWithUpworkPage() {
  // This code runs in the context of the web page
  console.log('Extension script running on Upwork page!');
  
  // Example: Get page title
  const pageTitle = document.title;
  console.log('Page title:', pageTitle);
  
  // Example: Get all job listings if on a job search page
  const jobListings = document.querySelectorAll('.job-title');
  if (jobListings.length > 0) {
    console.log('Found', jobListings.length, 'job listings:');
    jobListings.forEach((job, index) => {
      console.log(`Job ${index + 1}:`, job.textContent.trim());
    });
  }
  
  // Return a message to indicate the script ran
  return {
    message: 'Script executed successfully on Upwork page',
    url: window.location.href,
    timestamp: new Date().toISOString()
  };
} 