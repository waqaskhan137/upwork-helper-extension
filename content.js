// This script runs directly in the context of the web page
console.log('Upwork Helper Extension content script loaded!');

// Function to open results in a new tab
function openResultsInNewTab(data) {
  chrome.runtime.sendMessage({
    action: 'openResultsTab',
    data: data
  });
}

// Function to extract job details
function extractJobDetails(jobCard) {
  try {
    // Get the job title element and its link
    const titleElement = jobCard.querySelector('h3.job-tile-title a');
    const title = titleElement?.textContent.trim() || 'No title';
    const jobUrl = titleElement?.href || '';

    // Get all other job details
    const details = {
      title,
      url: jobUrl,
      postedTime: jobCard.querySelector('span[data-test="posted-on"]')?.textContent.trim() || 'No posted time',
      description: jobCard.querySelector('span[data-test="job-description-text"]')?.textContent.trim() || 'No description',
      jobType: jobCard.querySelector('strong[data-test="job-type"]')?.textContent.trim() || 'No job type',
      experienceLevel: jobCard.querySelector('span[data-test="contractor-tier"]')?.textContent.trim() || 'No experience level',
      duration: jobCard.querySelector('span[data-test="duration"]')?.textContent.trim() || 'No duration',
      skills: Array.from(jobCard.querySelectorAll('a[data-test="attr-item"]'))
        .map(skill => skill.textContent.trim()),
      clientInfo: {
        paymentVerified: jobCard.querySelector('small[data-test="payment-verification-status"]')?.textContent.trim() || 'No verification info',
        location: jobCard.querySelector('small[data-test="client-country"]')?.textContent.trim() || 'No location',
        spent: jobCard.querySelector('span[data-test="formatted-amount"]')?.textContent.trim() || 'No spending info'
      },
      proposals: jobCard.querySelector('strong[data-test="proposals"]')?.textContent.trim() || 'No proposals'
    };
    
    return details;
  } catch (e) {
    console.error('Error extracting job details:', e);
    return null;
  }
}

// Function to extract filter information
function extractFilters() {
  try {
    const filterSection = document.querySelector('[data-test="search-filters"]');
    if (!filterSection) return null;

    return {
      categories: Array.from(filterSection.querySelectorAll('[data-test="category-filter"] option'))
        .map(opt => opt.textContent.trim()),
      experienceLevels: Array.from(filterSection.querySelectorAll('[data-test="experience-level-filter"] option'))
        .map(opt => opt.textContent.trim()),
      jobTypes: Array.from(filterSection.querySelectorAll('[data-test="job-type-filter"] option'))
        .map(opt => opt.textContent.trim()),
      clientHistory: Array.from(filterSection.querySelectorAll('[data-test="client-history-filter"] option'))
        .map(opt => opt.textContent.trim())
    };
  } catch (e) {
    console.error('Error extracting filters:', e);
    return null;
  }
}

// Main script function
function runScript() {
  console.log('Running Upwork helper script...');
  
  try {
    // First try to find the job tile list container
    const jobTileList = document.querySelector('[data-test="job-tile-list"]');
    if (!jobTileList) {
      console.log('Job tile list container not found');
      return {
        status: 'Error: Job tile list container not found',
        timestamp: new Date().toISOString()
      };
    }

    // Get all job cards within the container
    const jobCards = jobTileList.querySelectorAll('section.air3-card-section');
    console.log(`Found ${jobCards.length} job cards`);
    
    const jobListings = [];
    
    // Extract job listings
    jobCards.forEach((card, index) => {
      const jobDetails = extractJobDetails(card);
      if (jobDetails) {
        jobListings.push(jobDetails);
      }
    });

    // Get filter information
    const filters = extractFilters();

    // Get navigation state
    const currentSection = document.querySelector('[data-test="active-section"]')?.textContent.trim() || 
                         'Section not found';

    // Prepare results
    const results = {
      pageInfo: {
        title: document.title,
        currentSection,
        totalJobs: jobListings.length,
        url: window.location.href,
        timestamp: new Date().toISOString()
      },
      filters: filters,
      jobs: jobListings
    };

    // Open results in a new tab
    openResultsInNewTab(results);

    return {
      status: 'Script executed successfully',
      jobCount: jobListings.length,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error in content script:', error);
    
    chrome.runtime.sendMessage({
      action: 'contentScriptError',
      data: {
        message: 'Error in content script: ' + error.message,
        url: window.location.href,
        timestamp: new Date().toISOString()
      }
    });
    
    return {
      status: 'Error: ' + error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('Content script received message:', message);
  
  if (message.action === 'runScript') {
    try {
      const result = runScript();
      sendResponse(result);
    } catch (error) {
      console.error('Error running script on demand:', error);
      sendResponse({
        status: 'Error: ' + error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  return true; // Keep the message channel open for async response
}); 