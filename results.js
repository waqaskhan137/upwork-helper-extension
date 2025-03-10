// Cache DOM elements
const elements = {
    json: document.getElementById('json'),
    timestamp: document.getElementById('timestamp'),
    formattedContent: document.getElementById('formatted-content'),
    copyButton: document.getElementById('copyButton'),
    downloadButton: document.getElementById('downloadButton'),
    chatButton: document.getElementById('chatButton'),
    chatContainer: document.getElementById('chatContainer'),
    chatClose: document.getElementById('chatClose'),
    chatMessages: document.getElementById('chatMessages'),
    chatInput: document.getElementById('chatInput'),
    chatSend: document.getElementById('chatSend'),
    expandButton: document.getElementById('chatExpandButton')
};

// Toast notification system
const toast = {
    show(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }, 100);
    }
};

// Chat functionality
const chat = {
    messages: [],
    isExpanded: false,
    
    toggleChat() {
        elements.chatContainer.classList.toggle('show');
        if (elements.chatContainer.classList.contains('show')) {
            elements.chatInput.focus();
        }
    },

    toggleExpand() {
        this.isExpanded = !this.isExpanded;
        elements.chatContainer.classList.toggle('expanded');
        elements.expandButton.innerHTML = this.isExpanded ? 
            '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>' :
            '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
    },

    addMessage(content, isUser = true) {
        const message = {
            content,
            isUser,
            timestamp: new Date()
        };
        
        this.messages.push(message);
        this.displayMessage(message);
        
        if (isUser) {
            this.processUserMessage(content);
        }
        
        // Scroll to bottom
        elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    },

    displayMessage(message) {
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.isUser ? 'user-message' : 'assistant-message'}`;
        
        // Create content container for markdown
        const contentElement = document.createElement('div');
        contentElement.className = 'message-content';
        
        // Render markdown for assistant messages, plain text for user
        if (message.isUser) {
            contentElement.textContent = message.content;
        } else {
            // Configure marked options for security
            marked.setOptions({
                breaks: true, // Enable line breaks
                sanitize: true, // Sanitize HTML input
                gfm: true, // Enable GitHub Flavored Markdown
            });
            
            // Render markdown
            contentElement.innerHTML = marked.parse(message.content);
        }
        
        messageElement.appendChild(contentElement);
        elements.chatMessages.appendChild(messageElement);
        return messageElement;
    },

    async processUserMessage(content) {
        // Show typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'message assistant-message typing-indicator';
        typingIndicator.innerHTML = '<span></span><span></span><span></span>';
        elements.chatMessages.appendChild(typingIndicator);

        try {
            const jobsData = window.jsonData;

            // Prepare context for the LLM
            const context = {
                totalJobs: jobsData.jobs.length,
                jobTypes: [...new Set(jobsData.jobs.map(job => job.jobType))],
                experienceLevels: [...new Set(jobsData.jobs.map(job => job.experienceLevel))],
                allSkills: [...new Set(jobsData.jobs.flatMap(job => job.skills))],
                highestPaying: jobsData.jobs
                    .filter(job => job.clientInfo?.spent)
                    .sort((a, b) => {
                        const spentA = parseFloat(a.clientInfo.spent.replace(/[^0-9.]/g, '')) || 0;
                        const spentB = parseFloat(b.clientInfo.spent.replace(/[^0-9.]/g, '')) || 0;
                        return spentB - spentA;
                    })
                    .slice(0, 5)
            };

            // Send request to background script to handle API call
            const response = await chrome.runtime.sendMessage({
                action: 'processLLMQuery',
                data: {
                    query: content,
                    context: context
                }
            });

            // Remove typing indicator
            typingIndicator.remove();

            if (response.error) {
                this.addMessage('Sorry, I encountered an error: ' + response.error, false);
            } else {
                this.addMessage(response.result, false);
            }

        } catch (error) {
            console.error('Error processing message:', error);
            typingIndicator.remove();
            this.addMessage('Sorry, I encountered an error processing your request.', false);
        }
    },

    handleInput(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    },

    sendMessage() {
        const content = elements.chatInput.value.trim();
        if (content) {
            this.addMessage(content);
            elements.chatInput.value = '';
        }
    }
};

// Function to syntax highlight JSON
function syntaxHighlight(json) {
    if (typeof json != 'string') {
        json = JSON.stringify(json, null, 2);
    }
    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        var cls = 'number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'key';
            } else {
                cls = 'string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'boolean';
        } else if (/null/.test(match)) {
            cls = 'null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

// Function to copy JSON to clipboard
async function copyToClipboard() {
    try {
        const jsonStr = JSON.stringify(window.jsonData, null, 2);
        await navigator.clipboard.writeText(jsonStr);
        toast.show('JSON copied to clipboard!', 'success');
    } catch (err) {
        console.error('Failed to copy JSON:', err);
        toast.show('Failed to copy JSON to clipboard', 'error');
    }
}

// Function to download JSON file
function downloadJSON() {
    try {
        const jsonStr = JSON.stringify(window.jsonData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().slice(0,19).replace(/[:]/g, '-');
        
        a.href = url;
        a.download = `upwork-jobs-${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        toast.show('JSON file downloaded successfully', 'success');
    } catch (error) {
        console.error('Error downloading JSON:', error);
        toast.show('Failed to download JSON file', 'error');
    }
}

// Function to create a job card with error handling
function createJobCard(job) {
    if (!job) return '';
    
    const {
        title = 'No Title',
        url = '#',
        jobType = 'N/A',
        experienceLevel = 'N/A',
        duration = 'N/A',
        postedTime = 'N/A',
        description = 'No description available',
        skills = [],
        clientInfo = {}
    } = job;

    const {
        location = 'Location not specified',
        spent = 'No spending info',
        paymentVerified = 'Payment verification status unknown'
    } = clientInfo;

    const verifiedBadgeClass = paymentVerified.toLowerCase().includes('verified') ? 'verified' : '';

    return `
        <div class="job-card">
            <h3 class="job-title">
                <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
            </h3>
            <div class="job-meta">
                ${jobType !== 'N/A' ? `<span class="tag">${jobType}</span>` : ''}
                ${experienceLevel !== 'N/A' ? `<span class="tag">${experienceLevel}</span>` : ''}
                ${duration !== 'N/A' ? `<span class="tag">${duration}</span>` : ''}
                <span class="posted-time">Posted: ${postedTime}</span>
            </div>
            <div class="job-description">${description}</div>
            ${skills.length > 0 ? `
                <div class="skills-list">
                    ${skills.map(skill => `<span class="skill-tag">${skill}</span>`).join('')}
                </div>
            ` : ''}
            <div class="client-info">
                <div class="client-location">${location} · ${spent}</div>
                <div class="verified-badge ${verifiedBadgeClass}">${paymentVerified}</div>
                <div class="proposals">${job.proposals || 'No proposals info'}</div>
            </div>
        </div>
    `;
}

// Function to format and display the content
function formatContent(data) {
    if (!data) {
        console.error('No data provided to formatContent');
        toast.show('Error: No data available', 'error');
        return;
    }

    try {
        const { 
            pageInfo = {},
            jobs = [],
            filters = null
        } = data;

        let content = '';

        // Page Info Section
        content += `
            <div class="section">
                <div class="section-header">
                    <h3>Page Information</h3>
                </div>
                <div class="section-content">
                    <div>Total Jobs Found: ${pageInfo?.totalJobs || 0}</div>
                    <div>Section: ${pageInfo?.currentSection || 'N/A'}</div>
                </div>
            </div>
        `;

        // Jobs Grid
        content += `
            <div class="section">
                <div class="section-header">
                    <h3>Available Jobs ${jobs.length ? `(${jobs.length})` : ''}</h3>
                </div>
                ${jobs.length ? `
                    <div class="job-grid">
                        ${jobs.map(job => createJobCard(job)).join('')}
                    </div>
                ` : `
                    <div class="section-content">
                        <p>No jobs found.</p>
                    </div>
                `}
            </div>
        `;

        // Filters Section
        if (filters && Array.isArray(filters.categories) && filters.categories.length > 0) {
            content += `
                <div class="section">
                    <div class="section-header">
                        <h3>Available Filters</h3>
                    </div>
                    <div class="section-content">
                        <div class="skills-list">
                            ${filters.categories.map(cat => 
                                `<span class="skill-tag">${cat || 'Unknown'}</span>`
                            ).join('')}
                        </div>
                    </div>
                </div>
            `;
        }

        if (elements.formattedContent) {
            elements.formattedContent.innerHTML = content;
        } else {
            console.error('Formatted content container not found');
            toast.show('Error: Could not display content', 'error');
        }
    } catch (error) {
        console.error('Error formatting content:', error);
        toast.show('Error: Failed to format content', 'error');
        
        // Fallback display of raw data
        if (elements.formattedContent) {
            elements.formattedContent.innerHTML = `
                <div class="section">
                    <div class="section-header">
                        <h3>Error Processing Data</h3>
                    </div>
                    <div class="section-content">
                        <p>There was an error processing the data. Raw data is shown below:</p>
                        <pre>${JSON.stringify(data, null, 2)}</pre>
                    </div>
                </div>
            `;
        }
    }
}

// Initialize the page
function initializePage() {
    // Add event listeners for existing functionality
    elements.copyButton?.addEventListener('click', copyToClipboard);
    elements.downloadButton?.addEventListener('click', downloadJSON);

    // Add chat event listeners
    elements.chatButton?.addEventListener('click', () => chat.toggleChat());
    elements.chatClose?.addEventListener('click', () => chat.toggleChat());
    elements.chatSend?.addEventListener('click', () => chat.sendMessage());
    elements.chatInput?.addEventListener('keypress', (e) => chat.handleInput(e));
    elements.expandButton?.addEventListener('click', () => chat.toggleExpand());

    // Add welcome message
    if (elements.chatMessages) {
        chat.addMessage('Hello! I can help you analyze these job listings. What would you like to know?', false);
    }

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .chat-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 320px;
            height: 400px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            display: none;
            flex-direction: column;
            z-index: 1000;
            transition: all 0.3s ease;
        }

        .chat-container.show {
            display: flex;
        }

        .chat-container.expanded {
            width: 80vw;
            height: 80vh;
            max-width: 800px;
            max-height: 600px;
        }

        .chat-header {
            padding: 16px;
            background: var(--secondary-color);
            color: white;
            border-radius: 12px 12px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .chat-controls {
            display: flex;
            gap: 8px;
            align-items: center;
        }

        .chat-expand-button,
        .chat-close-button {
            background: none;
            border: none;
            color: white;
            cursor: pointer;
            padding: 4px;
            opacity: 0.8;
            transition: opacity 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .chat-expand-button:hover,
        .chat-close-button:hover {
            opacity: 1;
        }

        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .message {
            max-width: 80%;
            padding: 8px 12px;
            border-radius: 12px;
            margin: 4px 0;
            word-wrap: break-word;
        }

        .user-message {
            background: var(--primary-color);
            color: white;
            align-self: flex-end;
        }

        .assistant-message {
            background: #f0f0f0;
            color: #333;
            align-self: flex-start;
        }

        .chat-input-container {
            padding: 16px;
            border-top: 1px solid #eee;
            display: flex;
            gap: 8px;
        }

        .chat-input {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 20px;
            outline: none;
            font-size: 14px;
        }

        .chat-input:focus {
            border-color: var(--primary-color);
        }

        .chat-send {
            background: var(--primary-color);
            color: white;
            border: none;
            border-radius: 20px;
            padding: 8px 16px;
            cursor: pointer;
            transition: background 0.2s ease;
        }

        .chat-send:hover {
            background: var(--primary-color-dark);
        }

        .typing-indicator {
            padding: 12px;
            display: flex;
            gap: 4px;
        }

        .typing-indicator span {
            width: 8px;
            height: 8px;
            background: var(--secondary-color);
            border-radius: 50%;
            animation: bounce 1s infinite;
        }

        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-4px); }
        }
    `;
    document.head.appendChild(style);
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', initializePage);

// Listen for messages from the background script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log('Message received in results.js:', message);

    if (!message) {
        console.error('No message received');
        return;
    }

    if (message.type === 'LLM_RESPONSE') {
        chat.addMessage(message.content, false);
        return;
    }

    if (message.type === 'UPWORK_JOBS_DATA') {
        if (!message.data) {
            console.error('Message received but no data found:', message);
            toast.show('Error: No data received', 'error');
            return;
        }

        try {
            // Store JSON data globally
            window.jsonData = message.data;
            
            // Update JSON view
            if (elements.json) {
                elements.json.innerHTML = syntaxHighlight(message.data);
            }

            // Update timestamp
            if (elements.timestamp) {
                elements.timestamp.textContent = 'Generated on: ' + new Date().toLocaleString();
            }

            // Format and display content
            formatContent(message.data);
            
            // Send response back to confirm receipt
            sendResponse({ status: 'success' });
        } catch (error) {
            console.error('Error processing message:', error);
            toast.show('Error processing data', 'error');
            sendResponse({ status: 'error', message: error.message });
        }
    }
    
    return true; // Keep the message channel open for async response
}); 