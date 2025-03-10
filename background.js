// Background script for the Upwork Helper Extension
console.log('Background script loaded');

// Store data temporarily with timestamp
let pendingData = {
  data: null,
  timestamp: null,
  tabId: null
};

// Configuration
const CONFIG = {
  TIMEOUT_DELAY: 1000,
  MAX_RETRIES: 3,
  DATA_EXPIRY: 5 * 60 * 1000, // 5 minutes
  LLM_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  LLM_API_KEY: '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',
  LLM_MODEL: 'llama-3.3-70b-versatile'  // Using a valid Groq model
};

// Process LLM query
async function processLLMQuery(query, context) {
  try {
    // Prepare the system message and user query
    const messages = [
      {
        role: "system",
        content: `You are an AI assistant helping analyze Upwork job listings.
Current context:
- Total jobs: ${context.totalJobs}
- Available job types: ${context.jobTypes.join(', ')}
- Experience levels: ${context.experienceLevels.join(', ')}
- Common skills: ${context.allSkills.join(', ')}

Please format your responses using Markdown:
- Use **bold** for emphasis
- Use \`code\` for technical terms
- Use bullet points and numbered lists where appropriate
- Use headings (##) to organize information
- Use > for important quotes or highlights
- Use tables when comparing data
- Include code blocks with proper syntax highlighting when relevant

Provide concise and well-formatted analysis based on this data.`
      },
      {
        role: "user",
        content: query
      }
    ];

    // Make API call to Groq without streaming
    const response = await fetch(CONFIG.LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.LLM_API_KEY}`
      },
      body: JSON.stringify({
        model: CONFIG.LLM_MODEL,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`LLM API request failed: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error('Invalid response format from LLM API');
    }

    const content = data.choices[0].message.content;
    
    // Send the complete response to the tab
    if (pendingData.tabId) {
      try {
        await chrome.tabs.sendMessage(pendingData.tabId, {
          type: 'LLM_RESPONSE',
          content: content
        });
      } catch (err) {
        console.error('Error sending response:', err);
      }
    }

    return { result: content };

  } catch (error) {
    console.error('Error processing LLM query:', error);
    return { error: error.message };
  }
}

// Clear old pending data
function clearOldPendingData() {
  if (pendingData.timestamp && 
      Date.now() - pendingData.timestamp > CONFIG.DATA_EXPIRY) {
    pendingData = { data: null, timestamp: null, tabId: null };
    console.log('Cleared expired pending data');
  }
}

// Send message to tab with retry logic
async function sendMessageToTab(tabId, message, retries = 0) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    console.log('Message sent successfully:', response);
    return response;
  } catch (error) {
    console.error(`Error sending message (attempt ${retries + 1}):`, error);
    if (retries < CONFIG.MAX_RETRIES) {
      console.log(`Retrying in ${CONFIG.TIMEOUT_DELAY}ms...`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.TIMEOUT_DELAY));
      return sendMessageToTab(tabId, message, retries + 1);
    }
    throw error;
  }
}

// Listen for installation
chrome.runtime.onInstalled.addListener(function(details) {
  console.log('Extension installed:', details.reason);
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Clear any expired data
  clearOldPendingData();

  if (changeInfo.status === 'complete' && 
      tab.url && 
      tab.url.includes(chrome.runtime.getURL('results.html'))) {
    
    if (pendingData.data && (!pendingData.tabId || pendingData.tabId === tabId)) {
      console.log('Sending pending data to results page');
      
      try {
        await sendMessageToTab(tabId, {
          type: 'UPWORK_JOBS_DATA',
          data: pendingData.data
        });
        // Clear the pending data only after successful send
        pendingData = { data: null, timestamp: null, tabId: null };
      } catch (error) {
        console.error('Failed to send data after all retries:', error);
      }
    }
  }
});

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('Message received in background:', message);
  
  if (message.action === 'processLLMQuery') {
    processLLMQuery(message.data.query, message.data.context)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep the message channel open for async response
  }
  
  if (message.action === 'openResultsTab') {
    if (!message.data) {
      console.error('No data received with openResultsTab message');
      sendResponse({ error: 'No data provided' });
      return true;
    }

    // Store the data with timestamp
    pendingData = {
      data: message.data,
      timestamp: Date.now(),
      tabId: null
    };
    
    // Create a new tab with results.html
    chrome.tabs.create({
      url: chrome.runtime.getURL('results.html')
    }).then(tab => {
      pendingData.tabId = tab.id;
      console.log('Results tab created:', tab);
      sendResponse({ status: 'success', tabId: tab.id });
    }).catch(error => {
      console.error('Error creating results tab:', error);
      sendResponse({ error: error.message });
    });
  }
  
  return true;
}); 