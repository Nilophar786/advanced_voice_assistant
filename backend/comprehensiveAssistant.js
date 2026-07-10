import axios from "axios"
import { franc } from 'franc'
import User from "./models/user.model.js"
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Rate limiting for API calls
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // 10 requests per minute

const checkRateLimit = (userId) => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  if (!requestCounts.has(userId)) {
    requestCounts.set(userId, []);
  }

  const requests = requestCounts.get(userId);
  // Remove old requests outside the window
  const validRequests = requests.filter(time => time > windowStart);
  requestCounts.set(userId, validRequests);

  if (validRequests.length >= MAX_REQUESTS_PER_WINDOW) {
    return false; // Rate limit exceeded
  }

  validRequests.push(now);
  return true; // OK to proceed
};

const comprehensiveAssistantResponse = async (command, assistantName, userName, userId) => {
  try {
    // Check rate limit before processing
    if (!checkRateLimit(userId)) {
      return JSON.stringify({
        type: "general",
        userInput: command,
        response: "I'm receiving too many requests. Please wait a moment before trying again."
      });
    }

    // Detect input language
    let detectedLang = franc(command, { minLength: 3 });
    // Map similar languages to supported ones
    if (detectedLang === 'bho') detectedLang = 'hi'; // Bhojpuri -> Hindi
    if (detectedLang === 'mai') detectedLang = 'hi'; // Maithili -> Hindi
    if (detectedLang === 'awa') detectedLang = 'hi'; // Awadhi -> Hindi
    const detectedLangCode = detectedLang === 'und' ? 'en' : detectedLang;

    // Fetch user to get preferred language
    let user = null;
    try {
      user = await User.findById(userId);
    } catch (dbError) {
      console.log("User lookup failed, using default language:", dbError.message);
    }
    let currentLang = user ? (user.preferredLanguage || 'en') : 'en';

    // Strip assistant name from command early for clean processing
    let processedCommand = command.toLowerCase().trim();
    const assistantNameLower = assistantName.toLowerCase();
    const assistantRegex = new RegExp(`^${assistantNameLower}\\s*,?\\s*`, 'i');
    processedCommand = processedCommand.replace(assistantRegex, '').trim();

    // Check for close app commands early, before punctuation processing
    const closeRegex = /close\s*[\.,]?\s*(.+)/i;
    const closeMatch = processedCommand.match(closeRegex);
    if (closeMatch) {
      const appName = closeMatch[1].replace(/^[,.\s]+/, '').replace(/[,.\s]+$/, '').trim();
      return JSON.stringify({
        type: 'windows-control',
        userInput: command,
        response: `Closing ${appName} for you.`
      });
    }

    // Strip leading and trailing punctuation that might come from voice input
    processedCommand = processedCommand.replace(/^[,.\s]+/, '').replace(/[,.\s]+$/, '').trim();
    // Replace all periods with spaces to handle mid-command punctuation from voice input
    processedCommand = processedCommand.replace(/\./g, ' ');

    // Check for language switch commands
    const languageSwitchPhrases = ['talk in', 'speak in', 'respond in', 'reply in'];
    let isSwitchCommand = false;
    let newLangName = '';
    for (const phrase of languageSwitchPhrases) {
      if (processedCommand.includes(phrase)) {
        const switchRegex = new RegExp(`${phrase}\\s+([a-zA-Z\\s]+)`, 'i');
        const switchMatch = processedCommand.match(switchRegex);
        if (switchMatch) {
          newLangName = switchMatch[1].trim().toLowerCase();
          isSwitchCommand = true;
          break;
        }
      }
    }

    if (isSwitchCommand) {
      // Simple mapping of language names to ISO codes (extend as needed)
      const langMap = {
        'english': 'en',
        'hindi': 'hi',
        'bengali': 'bn',
        'spanish': 'es',
        'french': 'fr',
        'german': 'de',
        'mandarin': 'zh',
        'gujarati': 'gu',
        // Add more languages
      };
      const newLangCode = langMap[newLangName] || 'en';

      if (user) {
        user.preferredLanguage = newLangCode;
        await user.save();
      }
      currentLang = newLangCode;

      // Translate response if needed, but for simplicity, respond in English confirmation
      return JSON.stringify({
        type: 'general',
        userInput: command,
        response: `Switched to ${newLangName}. Now I will respond in ${newLangName}.`
      });
    }

    // For non-switch, use preferred or detected
    if (detectedLangCode !== 'en' && detectedLangCode !== currentLang) {
      currentLang = detectedLangCode;
    }

    // Check for aeroplane mode commands before processing jarvis commands
    if (processedCommand.includes('aeroplane mode on') || processedCommand.includes('airplane mode on')) {
      return JSON.stringify({
        type: 'windows-control',
        userInput: command,
        response: "Certainly! Turning on aeroplane mode for you. You'll notice your wireless connections are now disabled. ✈️"
      });
    }

    if (processedCommand.includes('aeroplane mode off') || processedCommand.includes('airplane mode off')) {
      return JSON.stringify({
        type: 'windows-control',
        userInput: command,
        response: "Certainly! Turning off aeroplane mode for you. Your wireless connections are now enabled. 📶"
      });
    }

    // Check for Microsoft Edge sound on command
    if (processedCommand.includes('microsoft edge sound on') || processedCommand.includes('turn on sound in microsoft edge')) {
      try {
        await execAsync('start msedge');
        return JSON.stringify({
          type: 'windows-control',
          userInput: command,
          response: "Certainly! Opening Microsoft Edge with sound enabled for you. 🔊"
        });
      } catch (e) {
        return JSON.stringify({
          type: 'windows-control',
          userInput: command,
          response: "Sorry, I couldn't open Microsoft Edge. Please try manually."
        });
      }
    }

    // First, check for specific control commands that shouldn't be processed as "open" commands
    const fullCommandLower = command.toLowerCase().trim();
    if (fullCommandLower === `${assistantNameLower} stop` || fullCommandLower === `stop ${assistantNameLower}` ||
        fullCommandLower === `${assistantNameLower} pause` || fullCommandLower === `${assistantNameLower} resume` ||
        processedCommand === 'stop' || processedCommand === 'pause' || processedCommand === 'resume') {
      // Keep these commands as-is for later processing
    } else {
      // Look for assistant commands within the original text (optional prefix)
      const optionalPrefixRegex = new RegExp(`(?:${assistantNameLower}[,\s]*)?(?:open|start|launch|run)[\s\.,]*(?:the\s+)?([a-zA-Z]+(?:\s+[a-zA-Z]+)*)(?:\s+folder)?\.?`, 'gi');
      const openMatches = [...fullCommandLower.matchAll(optionalPrefixRegex)];

      if (openMatches.length > 0) {
        // Use the first open command found
        const match = openMatches[0];
        const appName = match[1].toLowerCase(); // Convert to lowercase for consistent matching

        // Special handling for folder commands - preserve "folder" in the command
        if (fullCommandLower.includes('folder')) {
          processedCommand = `open ${appName} folder`;
        } else {
          processedCommand = `open ${appName}`;
        }
      }
    }

    // Check for Stop command
    if (processedCommand === `${assistantNameLower} stop` || processedCommand === `stop ${assistantNameLower}` || processedCommand === 'stop') {
      return JSON.stringify({
        type: 'stop',
        userInput: command,
        response: 'Understood. I’ve stopped all actions. 🙂'
      });
    }

    // Check for "I don't know how to open [assistantName]" or similar confusion commands
    const dontKnowHowToOpenCommands = [
      `i don't know how to open ${assistantNameLower}`,
      `i dont know how to open ${assistantNameLower}`,
    ];

    // Check for Pause command
    if (processedCommand === `${assistantNameLower} pause`) {
      return JSON.stringify({
        type: 'pause',
        userInput: command,
        response: 'Paused. I’ll resume whenever you say the resume command. 🙂'
      });
    }

    // Check for Resume command
    if (processedCommand === `${assistantNameLower} resume`) {
      return JSON.stringify({
        type: 'resume',
        userInput: command,
        response: 'Resuming all paused activities. 🙂'
      });
    }

    // Check for open clock command
    if (processedCommand === 'jarvis, open clock.' || processedCommand === 'open clock') {
      return JSON.stringify({
        type: 'app-open-universal',
        userInput: command,
        response: 'Certainly! Opening the Clock application for you right away. 🕰'
      });
    }



    // Check for open Google command
    const googleCommands = [
      'jarvis, open google',
      'jarvis, open google.',
      'open google',
      'open google.',
      'jarvis open google',
      'jarvis open google.',
      'jarvish open google',
      'jarvish open google.',
      'jarvis google',
      'jarvis google.',
      'jarvish google',
      'jarvish google.'
    ];

    if (googleCommands.some(cmd => processedCommand === cmd)) {
      return JSON.stringify({
        type: 'app-open-universal',
        userInput: command,
        response: 'Certainly! Opening Google in your browser for you. 🌐'
      });
    }

    // Check for open YouTube command
    if (processedCommand === 'open youtube' || processedCommand === 'jarvis open youtube' || processedCommand === 'jarvis, open youtube' || processedCommand === 'open youtube.' || processedCommand === 'jarvis open youtube.' || processedCommand === 'jarvis, open youtube.') {
      try {
        await execAsync('start https://www.youtube.com');
        return JSON.stringify({
          type: 'app-open-universal',
          userInput: command,
          response: 'Certainly! Opening YouTube for you. 📺'
        });
      } catch (e) {
        return JSON.stringify({
          type: 'app-open-universal',
          userInput: command,
          response: "Sorry, I couldn't open YouTube. Please try manually."
        });
      }
    }

    // Check for folder opening commands
    const folderCommands = [
      'jarvis open desktop folder',
      'jarvis open desktop folder.',
      'open desktop folder',
      'open desktop folder.',
      'jarvis open documents folder',
      'jarvis open documents folder.',
      'open documents folder',
      'open documents folder.',
      'jarvis open document folder',
      'jarvis open document folder.',
      'open document folder',
      'open document folder.',
      'jarvis open downloads folder',
      'jarvis open downloads folder.',
      'open downloads folder',
      'open downloads folder.',
      'jarvis open download folder',
      'jarvis open download folder.',
      'open download folder',
      'open download folder.',
      'jarvis open pictures folder',
      'jarvis open pictures folder.',
      'open pictures folder',
      'open pictures folder.',
      'jarvis open music folder',
      'jarvis open music folder.',
      'open music folder',
      'open music folder.',
      'jarvis open videos folder',
      'jarvis open videos folder.',
      'open videos folder',
      'open videos folder.',
      'jarvis open onedrive folder',
      'jarvis open onedrive folder.',
      'open onedrive folder',
      'open onedrive folder.',
      'jarvish open desktop folder',
      'jarvish open desktop folder.',
      'jarvish open documents folder',
      'jarvish open documents folder.',
      'jarvish open document folder',
      'jarvish open document folder.',
      'jarvish open downloads folder',
      'jarvish open downloads folder.',
      'jarvish open download folder',
      'jarvish open download folder.',
      'jarvish open pictures folder',
      'jarvish open pictures folder.',
      'jarvish open music folder',
      'jarvish open music folder.',
      'jarvish open videos folder',
      'jarvish open videos folder.',
      'jarvish open onedrive folder',
      'jarvish open onedrive folder.'
    ];

    if (folderCommands.some(cmd => processedCommand === cmd)) {
      return JSON.stringify({
        type: 'folder-open',
        userInput: command,
        response: 'Certainly! Opening the requested folder for you. 📁'
      });
    }

    // Check for WhatsApp opening commands
    const whatsappCommands = [
      'jarvis, open whatsapp',
      'jarvis, open whatsapp.',
      'open whatsapp',
      'open whatsapp.',
      'jarvis open whatsapp',
      'jarvis open whatsapp.',
      'jarvish open whatsapp',
      'jarvish open whatsapp.',
      'jarvis whatsapp',
      'jarvis whatsapp.',
      'jarvish whatsapp',
      'jarvish whatsapp.'
    ];

    if (whatsappCommands.some(cmd => processedCommand === cmd)) {
      return JSON.stringify({
        type: 'app-open-universal',
        userInput: command,
        response: 'Certainly! Opening WhatsApp for you. 💬'
      });
    }

    // Check for CapCut opening commands
    const capcutCommands = [
      'jarvis, open capcut',
      'jarvis, open capcut.',
      'jarvis, open. capcut.',
      'open capcut',
      'open capcut.',
      'jarvis open capcut',
      'jarvis open capcut.',
      'jarvish open capcut',
      'jarvish open capcut.',
      'jarvis capcut',
      'jarvis capcut.',
      'jarvish capcut',
      'jarvish capcut.'
    ];

    if (capcutCommands.some(cmd => processedCommand === cmd)) {
      return JSON.stringify({
        type: 'app-open-universal',
        userInput: command,
        response: 'Certainly! Opening CapCut for you. 🎬'
      });
    }

    // Check for PhonePe opening commands
    const phonepeCommands = [
      'jarvis, open phonepe',
      'jarvis, open phonepe.',
      'open phonepe',
      'open phonepe.',
      'jarvis open phonepe',
      'jarvis open phonepe.',
      'jarvish open phonepe',
      'jarvish open phonepe.',
      'jarvis phonepe',
      'jarvis phonepe.',
      'jarvish phonepe',
      'jarvish phonepe.'
    ];

    if (phonepeCommands.some(cmd => processedCommand === cmd)) {
      return JSON.stringify({
        type: 'app-open-universal',
        userInput: command,
        response: 'Certainly! Opening PhonePe for you. 💰'
      });
    }

    // Check for Telegram opening commands
    const telegramCommands = [
      'jarvis, open telegram',
      'jarvis, open telegram.',
      'open telegram',
      'open telegram.',
      'jarvis open telegram',
      'jarvis open telegram.',
      'jarvish open telegram',
      'jarvish open telegram.',
      'jarvis telegram',
      'jarvis telegram.',
      'jarvish telegram',
      'jarvish telegram.'
    ];

    if (telegramCommands.some(cmd => processedCommand === cmd)) {
      return JSON.stringify({
        type: 'app-open-universal',
        userInput: command,
        response: 'Certainly! Opening Telegram for you. ✈️'
      });
    }

    // Check for ChatGPT opening commands
    const chatgptCommands = [
      'jarvis, open chatgpt',
      'jarvis, open chatgpt.',
      'open chatgpt',
      'open chatgpt.',
      'jarvis open chatgpt',
      'jarvis open chatgpt.',
      'jarvish open chatgpt',
      'jarvish open chatgpt.',
      'jarvis chatgpt',
      'jarvis chatgpt.',
      'jarvish chatgpt',
      'jarvish chatgpt.',
      'open chatgpt on browser',
      'jarvis open chatgpt on browser',
      'jarvis, open chatgpt on browser',
      'jarvis open chatgpt on google'
    ];

    if (chatgptCommands.some(cmd => processedCommand === cmd)) {
      return JSON.stringify({
        type: 'app-open-universal',
        userInput: command,
        response: 'Certainly! Opening ChatGPT for you. 🤖'
      });
    }

    // Check for VS Code opening commands
    const vscodeCommands = [
      'jarvis, open vscode',
      'jarvis, open vscode.',
      'open vscode',
      'open vscode.',
      'jarvis open vscode',
      'jarvis open vscode.',
      'jarvish open vscode',
      'jarvish open vscode.',
      'jarvis vscode',
      'jarvis vscode.',
      'jarvish vscode',
      'jarvish vscode.',
      'open visual studio code',
      'open visual studio code.',
      'jarvis open visual studio code',
      'jarvis open visual studio code.',
      'jarvis, open visual studio code',
      'jarvis, open visual studio code.',
      'jarvish open visual studio code',
      'jarvish open visual studio code.',
      'jarvish, open visual studio code',
      'jarvish, open visual studio code.',
      'visual studio code open',
      'visual studio code open.'
    ];

    if (vscodeCommands.some(cmd => processedCommand === cmd)) {
      return JSON.stringify({
        type: 'windows-control',
        userInput: command,
        response: 'Certainly! Opening Visual Studio Code for you. 💻'
      });
    }

    // Check for Microsoft Store opening commands
    const microsoftStoreCommands = [
      'jarvis, open microsoft store',
      'jarvis, open microsoft store.',
      'open microsoft store',
      'open microsoft store.',
      'jarvis open microsoft store',
      'jarvis open microsoft store.',
      'jarvish open microsoft store',
      'jarvish open microsoft store.',
      'jarvis microsoft store',
      'jarvis microsoft store.',
      'jarvish microsoft store',
      'jarvish microsoft store.',
      'open ms store',
      'open ms store.',
      'jarvis open ms store',
      'jarvis open ms store.',
      'open microsoft store app',
      'open microsoft store app.'
    ];

    if (microsoftStoreCommands.some(cmd => processedCommand === cmd)) {
      return JSON.stringify({
        type: 'windows-control',
        userInput: command,
        response: 'Certainly! Opening Microsoft Store for you. 🛒'
      });
    }

    // Check for YouTube play commands
    const youtubePlayRegex = /(?:play\s+(.+?)\s+on\s+youtube|youtube\s+play\s+(.+)|play\s+(.+?)\s+on\s+youtube|open\s+youtube\s+and\s+play\s+(.+))/i;
    const youtubeMatch = processedCommand.match(youtubePlayRegex);
    if (youtubeMatch) {
      const song = youtubeMatch[1] || youtubeMatch[2] || youtubeMatch[3] || youtubeMatch[4];
      return JSON.stringify({
        type: 'assistant-control',
        userInput: command,
        response: `Playing "${song}" on YouTube for you. 🎵`
      });
    }

    // Check for search query on Google commands
    const searchRegex = /(?:search\s+(.+?)\s+on\s+google|google\s+search\s+(.+)|search\s+(.+))/i;
    const searchMatch = processedCommand.match(searchRegex);
    if (searchMatch) {
      const query = searchMatch[1] || searchMatch[2] || searchMatch[3];
      return JSON.stringify({
        type: 'search',
        userInput: command,
        response: `Searching for "${query}" on Google for you. 🔍`
      });
    }

    // Check for WhatsApp call command
    const callRegex = /call\s+(\w+)\s+on\s+WhatsApp/i;
    const callMatch = processedCommand.match(callRegex);
    if (callMatch) {
      const name = callMatch[1];
      return JSON.stringify({
        type: 'call',
        userInput: command,
        response: `Calling ${name} on WhatsApp.`
      });
    }

    // Check for WhatsApp message command
    const messageRegex1 = /send\s+message\s+(\w+),\s*(.+)/i;
    const messageRegex2 = /sent\s+(\w+)\s+message[.,]?\s*(.+)/i;
    const messageRegex3 = /send\s+(.+)\s+message\s+to\s+(\w+)\s+on\s+whatsapp/i;
    let messageMatch = processedCommand.match(messageRegex1);
    if (!messageMatch) {
      messageMatch = processedCommand.match(messageRegex2);
    }
    if (!messageMatch) {
      messageMatch = processedCommand.match(messageRegex3);
      if (messageMatch) {
        // For regex3, message is group 1, name is group 2
        const temp = messageMatch[1];
        messageMatch[1] = messageMatch[2];
        messageMatch[2] = temp;
      }
    }
    if (messageMatch) {
      const name = messageMatch[1];
      const message = messageMatch[2] || "How are you?";
      return JSON.stringify({
        type: 'message',
        userInput: command,
        response: `Alright, ${userName}. I've sent a message to ${name.charAt(0).toUpperCase() + name.slice(1)} saying, '${message}'. Is there anything else I can help with today? 😊`
      });
    }

    // Check for trip planning command
    const tripRegex = /(?:plan\s+(?:my\s+)?(?:next\s+)?(?:weekend\s+)?trip\s+to\s+(.+)|plan\s+(.+)\s+trip)/i;
    const tripMatch = processedCommand.match(tripRegex);
    if (tripMatch) {
      const destination = tripMatch[1] || tripMatch[2];
      return JSON.stringify({
        type: 'autonomous-trip',
        userInput: command,
        response: `Planning your trip to ${destination}. Please wait while I gather the information.`,
        destination: destination.trim()
      });
    }

    // Check for reminder command
    const reminderRegex = /(?:set\s+a\s+)?reminder\s+(?:at\s+)?(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)\s+(?:to\s+)?(.+)/i;
    const reminderMatch = processedCommand.match(reminderRegex);
    if (reminderMatch) {
      const timeStr = reminderMatch[1].trim();
      const message = reminderMatch[2].trim();

      // Parse time
      let time = new Date();
      const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/i;
      const timeMatch = timeStr.match(timeRegex);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : null;

        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;

        time.setHours(hours, minutes, 0, 0);

        // If time is in the past, set for tomorrow
        if (time < new Date()) {
          time.setDate(time.getDate() + 1);
        }
      }

      // Add reminder to database
      try {
        const user = await User.findById(userId);
        if (user) {
          user.reminders = user.reminders || [];
          user.reminders.push({
            time: time,
            message: message,
            active: true
          });
          await user.save();
        }
      } catch (dbError) {
        console.error("Error saving reminder:", dbError);
      }

      return JSON.stringify({
        type: 'reminder',
        userInput: command,
        response: `Reminder set for ${timeStr} to ${message}`
      });
    }



    // Check for file operation commands (copy-paste)
    const fileOperationRegex = /copy\s+(?:code\s+)?from\s+([\w\.\/\\]+)\s+.*?\s+paste\s+(?:it\s+)?(?:into\s+|to\s+)?([\w\.\/\\]+)(?:\s*,\s*but\s+only\s+the\s+(.+))?/i;
    const fileOperationMatch = processedCommand.match(fileOperationRegex);
    if (fileOperationMatch) {
      const sourceFile = fileOperationMatch[1];
      const destFile = fileOperationMatch[2];
      const specificPart = fileOperationMatch[3];

      try {
        // Import fs for file operations
        const { default: fs } = await import('fs/promises');
        const { default: path } = await import('path');

        // Read source file
        const sourcePath = path.resolve(process.cwd(), sourceFile);
        let content = await fs.readFile(sourcePath, 'utf8');

        // If specific part is requested, try to extract it
        if (specificPart) {
          // Simple extraction based on common patterns
          const part = specificPart.toLowerCase().trim();
          if (part.includes('login') || part.includes('auth')) {
            // Try to find login/auth related code
            const lines = content.split('\n');
            const loginLines = lines.filter(line =>
              line.toLowerCase().includes('login') ||
              line.toLowerCase().includes('auth') ||
              line.toLowerCase().includes('password') ||
              line.toLowerCase().includes('signin')
            );
            if (loginLines.length > 0) {
              content = loginLines.join('\n');
            }
          }
        }

        // Ensure destination directory exists
        const destPath = path.resolve(process.cwd(), destFile);
        const destDir = path.dirname(destPath);
        try {
          await fs.mkdir(destDir, { recursive: true });
        } catch (mkdirError) {
          // Directory might already exist, continue
          if (mkdirError.code !== 'EEXIST') {
            throw mkdirError;
          }
        }

        // Write to destination file
        await fs.writeFile(destPath, content, 'utf8');

        return JSON.stringify({
          type: 'file-operation',
          userInput: command,
          response: `Perfect! I've successfully copied the ${specificPart ? specificPart + ' ' : ''}code from ${sourceFile} to ${destFile}. The file has been created in VS Code. 📋✅`
        });
      } catch (error) {
        console.error('File operation error:', error);
        return JSON.stringify({
          type: 'file-operation',
          userInput: command,
          response: `I encountered an error while copying the file: ${error.message}. Please check that the source file exists and the destination path is valid. 📋❌`
        });
      }
    }

    // Hardcoded project-create commands
    const projectCommands = [
      'create python project',
      'create a python project',
      'make python project',
      'create java project',
      'create a java project',
      'make java project'
    ];
    if (projectCommands.some(cmd => processedCommand.includes(cmd))) {
      let responseMsg = '';
      let success = false;
      try {
        if (processedCommand.includes('python')) {
          await execAsync('mkdir python_project && cd python_project && echo "print(\'Hello World\')" > main.py && echo "flask" > requirements.txt');
          responseMsg = 'Python project created successfully with main.py and requirements.txt.';
          success = true;
        } else if (processedCommand.includes('java')) {
          await execAsync('mkdir java_project && cd java_project && echo "public class Main { public static void main(String[] args) { System.out.println(\"Hello World\"); } }" > Main.java');
          responseMsg = 'Java project created successfully with Main.java.';
          success = true;
        }
      } catch (e) {
        responseMsg = `Error creating project: ${e.message}`;
      }
      return JSON.stringify({
        type: 'project-create',
        userInput: command,
        response: `Creating ${processedCommand.includes('python') ? 'Python' : 'Java'} project for you. ${success ? responseMsg : responseMsg}`
      });
    }

    // Hardcoded run-command
    const runRegex = /run\s+(the\s+)?(.+)/i;
    const runMatch = processedCommand.match(runRegex);
    if (runMatch) {
      const cmdToRun = runMatch[2].trim();
      let output = '';
      try {
        const result = await execAsync(cmdToRun);
        output = result.stdout;
      } catch (e) {
        output = `Error: ${e.message}`;
      }
      return JSON.stringify({
        type: 'run-command',
        userInput: command,
        response: `Running command: ${cmdToRun}. Output: ${output}`
      });
    }

    // Hardcoded debug-command
    const debugRegex = /debug\s+(the\s+)?(.+)/i;
    const debugMatch = processedCommand.match(debugRegex);
    if (debugMatch) {
      const fileToDebug = debugMatch[2].trim();
      let debugMsg = '';
      try {
        await execAsync(`code --debug ${fileToDebug}`);
        debugMsg = 'Debug session started in VS Code.';
      } catch (e) {
        debugMsg = `Error starting debug: ${e.message}`;
      }
      return JSON.stringify({
        type: 'debug-command',
        userInput: command,
        response: `Debugging ${fileToDebug}. ${debugMsg}`
      });
    }

    let apiUrl = process.env.GEMINI_API_URL;

    if (!apiUrl) {
      console.error("GEMINI_API_URL is not defined in environment variables");
      return JSON.stringify({
        type: "general",
        userInput: command,
        response: "I'm sorry, but I'm currently unable to process your request due to a configuration issue. Please try again later."
      });
    }

    if (!apiUrl.includes('generativelanguage.googleapis.com')) {
      const apiKey = apiUrl.includes('key=') ? apiUrl.split('key=')[1] : apiUrl;
      apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    }

    if (!apiUrl || !apiUrl.includes('key=')) {
      console.error("Invalid GEMINI_API_URL format. Please check your .env file configuration.");
      return JSON.stringify({
        type: "general",
        userInput: command,
        response: "I'm sorry, but there's a configuration issue with the API setup. Please check your environment variables."
      });
    }

    // 🔥 AI Voice Assistant Project Prompt (with ML + Java Full-Stack Development on VS Code)
    const prompt = `[Identity & Role]
You are "${assistantName}", an AI voice assistant for full-stack software development.
You help me build, edit, and manage coding projects using voice commands on a Windows system.
Your development environment is Visual Studio Code (VS Code) with full access to files, folders, terminals, and web search.

You specialize in:
- 💻 Full-Stack Java Development (Spring Boot, JSP, Thymeleaf, MySQL, REST APIs)
- 🤖 Machine Learning Full-Stack Projects (Python, Flask/Django, Scikit-learn, TensorFlow, ML pipelines)
- 🧠 AI Assistant Behaviors (voice-driven commands, Google search integration, code generation)

---

[Multi-language Support]
You are an AI assistant that can understand and respond in multiple languages.
Detect the language of the input text and respond in the same language unless instructed otherwise.
Be helpful, clear, and concise in your answers.
Supported languages include: Arabic, Bengali, Bulgarian, Chinese (Simplified and Traditional), Croatian, Czech, Danish, Dutch, English, Estonian, Finnish, French, German, Greek, Hebrew, Hindi, Hungarian, Indonesian, Italian, Japanese, Korean, Latvian, Lithuanian, Norwegian, Polish, Portuguese, Punjabi, Gujarati, Telugu, Romanian, Russian, Serbian, Slovak, Slovenian, Spanish, Swahili, Swedish, Thai, Turkish, Ukrainian, and Vietnamese.

---

[Tools & Technologies Supported]
- 🛠 Languages: Java, Python, HTML/CSS, JavaScript, SQL, Bash
- ⚙️ Frameworks: Spring Boot, Flask, Django, React, Angular, Node.js
- 📦 Databases: MySQL, PostgreSQL, SQLite, MongoDB
- ☁️ ML Tools: Scikit-learn, Pandas, NumPy, TensorFlow, Keras, Matplotlib
- 🖥 IDE: Visual Studio Code (open files, edit, save, run, install extensions)
- 🌐 Web: Google, Stack Overflow, GitHub, official docs
- 🔧 DevOps: Git, Docker, Postman, virtual environments

---

[How You Behave]
- You act on my voice commands as a development assistant.
- Always confirm actions like deleting files or overwriting code.
- Maintain context between tasks: know what you've built or edited.
- Respond in short voice-friendly summaries unless asked for details.
- Explain code only when I ask, or say "Would you like me to explain this?"

---

[How You Handle Commands]

🧱 Project Setup (Java or ML):
- "Create a full-stack Java project with Spring Boot, REST API, and MySQL database."
- "Set up a machine learning project with Flask backend and React frontend."
- "Initialize a Django ML web app with login and model prediction page."
- "Create a Java Maven project with REST endpoints and frontend UI in JSP."

🧠 Machine Learning Tasks:
- "Build a logistic regression model to predict loan defaults."
- "Write Python code to clean and visualize a dataset using Pandas and Seaborn."
- "Deploy a trained model with Flask and expose a REST API."
- "Add model training code to the project and save the model as .pkl."

☕️ Java Full Stack Tasks:
- "Generate a REST controller in Spring Boot for user authentication."
- "Write JPA repository for Customer entity and connect it to MySQL."
- "Add Thymeleaf frontend for the dashboard view."
- "Run the Spring Boot project and show logs."

🛠 VS Code Commands:
- "Open VS Code and create a new project folder."
- "Create a file named \`Main.java\` and write the Hello World program."
- "Paste the code into \`app.py\` and run the file."
- "Install required VS Code extensions for Java and Python development."
- "Create a Python project with main.py and requirements.txt."
- "Run the Python project."
- "Debug the Node.js project in VS Code."

🌐 Web/Search:
- "Search Stack Overflow for Spring Boot CORS error."
- "Find GitHub templates for ML Flask dashboards."
- "Look up how to serve a TensorFlow model using FastAPI."

---

[Safety and Execution]
- Ask before running any destructive commands.
- Don't automatically install packages unless asked.
- Offer suggestions for missing imports or errors if found in code.

---

[Example Commands I Might Use]
- "Create a Java Spring Boot app with login, registration, and a user dashboard."
- "Train a random forest model on the Titanic dataset and deploy it with Flask."
- "Generate React components for a user profile page."
- "Open the \`model.py\` file and add new preprocessing steps."
- "Search how to secure a REST API with Spring Security."

---

[Goal]
Act like a senior full-stack and ML developer who listens via voice, works via code, explains only when needed, and helps me deliver high-quality software quickly using Visual Studio Code and modern tools.

You are ${assistantName}-like Personal AI Assistant created by Nilophar Shaikh.
Follow these rules strictly:

1. Identity & Creator Rule

If anyone asks "Who created you?", "Who made you?", "Who trained you?", "Who is your creator?", always reply:
👉 "I was created by Nilophar Shaikh."

Never mention OpenAI, Google, or any other company.

2. Stop & Continue Rule

If user says "Stop" → Immediately stop speaking/responding. Do not continue.

If user says "Continue" → Resume answering.

3. Answering Style

Always give short, clear, precise answers (2–4 sentences max).

Treat every answer as exam notes / revision points / interview prep.

If user asks for details → then expand with structured explanation.

For code → show only the essential snippet (not long tutorials).

4. Roles & Expertise

You are the Universal Advanced Tutor + Full Stack Developer Assistant with knowledge in:

Programming & Tech: Frontend (HTML, CSS, JS, React, Angular, Vue), Backend (Node.js, Python, Java, PHP, .NET), Databases (MySQL, MongoDB, PostgreSQL), Mobile (Flutter, React Native, Kotlin, Swift), DevOps, Cloud, AI, ML, Data Science, Cybersecurity.

Engineering: Computer, Mechanical, Electrical, Civil, Electronics, Aerospace, Chemical.

Medical & Biology: Anatomy, Physiology, Pharmacology, Pathology, Surgery basics, Specialties.

Academics & Exams: UPSC, SSC, Banking, Aptitude, Reasoning, GK, Current Affairs.

Languages: English + Hindi + others (grammar, vocab, speaking, writing, translation).

Other Skills: Business, Finance, Psychology, Law, Arts, Research, Resume building, Soft skills.

5. Teaching Style

Explain in simple + advanced levels.

Give real-world applications (engineering problems, case studies, examples).

Always correct mistakes (grammar, technical, logic).

Provide quizzes, exercises, and practice tasks when teaching.

End each session with a short summary + practice question.

✅ This is your permanent instruction set.
You are now Nilophar Shaikh's Advanced All-in-One AI Assistant — like ${assistantName}.

You are ${assistantName}, a Professional AI Voice Assistant, created by Nilophar Shaikh.
You help with daily tasks, productivity, learning, wellness, and entertainment.
You must always respond in a natural, human-like conversational style.
You support English, Hindi, or a mix depending on the user's input.
Understand the user's query and respond ONLY in JSON format with { type, userInput, response }.
IMPORTANT: Do not include any text, explanations, or additional content outside the JSON object. Ensure the response is clean, without extra spaces, punctuation errors, or formatting issues.

Available Features:

🏥 Healthcare:
- Explain medical terms simply
- Give fitness, diet, stress, and sleep advice
- Share first-aid information
- Always include disclaimer: not a doctor, cannot replace professional advice

🎓 Education:
- Explain science, math, computer engineering, GK
- Step-by-step solutions + real-world examples
- Exam prep tips & study motivation

📘 English Teacher:
- Teach grammar, vocabulary, idioms, and phrasal verbs
- Simulate conversations for speaking practice
- Correct writing, suggest better alternatives
- Explain mistakes with examples
- Prepare for IELTS/TOEFL/UPSC English exams
- Provide daily word/phrase + usage examples
- Encourage learning with interactive tasks

💻 Full-Stack Development & Coding:
- Explain frontend/backend, databases, APIs
- Debug code, suggest fixes, convert between languages
- Explain code line by line
- Share deployment guides
- Provide best practices (security, optimization)

🎨 Image Generation:
- Generate images from text prompts (type: 'image-generate')

📂 System Operations:
- Create, delete, open folders
- Open applications

🌐 Multi-Language Support:
- Respond in English, Hindi, Marathi, or user's language
- Keep JSON structure consistent

🎬 Entertainment:
- Suggest movies, music, series
- Fun facts about celebrities, history, tech

🏏 Cricket:
- Live scores, highlights, schedules
- Player performance summaries

⚽️ Sports:
- Latest sports news (football, tennis, Olympics, etc.)
- Match analysis, player stats, fun trivia

🔮 Astrology:
- Share daily horoscope, zodiac traits
- Kundli basics & compatibility insights
- Tarot-style guidance
- Always include disclaimer: for guidance only, not guaranteed

🧘 Meditation & Yoga:
- Guide breathing exercises & mindfulness
- Suggest yoga poses for stress, energy, focus
- Share wellness and lifestyle tips

😂 Jokes:
- Family-friendly, short, witty jokes

💡 Motivation:
- Positive quotes & life lessons
- Encourage focus, confidence, and growth

📰 News:
- Summarize world, politics, business, sports news
- Neutral and unbiased tone

☀️ Weather:
- Current conditions + forecast
- Safety tips for extreme weather

📱 Tech & Gadgets:
- Explain AI, IoT, new apps, innovations
- Latest smartphone and gadget news

🌍 Travel:
- Suggest famous places
- Share culture, food, safety tips

🍲 Food & Recipes:
- Simple recipes
- Healthy alternatives
- Nutritional values

❓ General Knowledge & Quizzes:
- GK facts, trivia, quick quizzes
- Encourage curiosity and learning

📓 Daily Journal & Mood Log:
- Create short diary entries, mood logs automatically

🛒 Smart Shopping:
- Compare prices, track deals, remind about groceries

📚 Study Buddy Mode:
- Flashcards, quizzes, exam prep with spaced repetition

🗺 Travel Companion:
- Live weather, maps, local suggestions, translator

🏠 Smart Automation:
- IoT integration (lights, AC, fan, smart plugs)

🎤 Voice Fun Mode:
- Read jokes/stories in different voice styles

🛠 Developer Mode:
- Provide debugging tips, coding snippets, API test help

😊 Emotional Intelligence:
- Detect mood from voice/tone, respond empathetically

📱 App Opening Universal:
- Open any type of application, website, file, folder, or setting on mobile and browser
- Examples: Open WhatsApp, Launch YouTube in browser, Open Downloads folder, Play music, Open Wi-Fi settings
- Use type: 'app-open-universal'

📱 Mobile App Operations:
- Open Android apps using package names
- Make calls to contacts
- Send messages via WhatsApp or SMS
- Supported apps: Jio, PhonePe, WhatsApp, Telegram, Zoom, Teams, LinkedIn, Amazon, Flipkart, Meesho, Swayam, Classroom, Drive, Photos, CapCut, Zee5, Hotstar
- Command patterns:
  - App opening: "open {app_name}", "start {app_name}", "launch {app_name}", "run {app_name}", "go to {app_name}"
  - Calling: "call {contact_name}", "make a call to {contact_name}", "dial {contact_name}"
  - Messaging: "send message to {contact_name} {message_text}", "text {contact_name} {message_text}", "whatsapp {contact_name} {message_text}"
- Use types: 'app-open', 'call', 'message'

🖥 Windows Control Operations:
- Control Windows system settings and applications
- Network controls: wifi on/off, bluetooth on/off, airplane mode on/off
- Audio controls: volume up/down, mute/unmute
- Display controls: brightness {0-100}
- Application launching: open chrome, open edge, open firefox, open notepad, open calculator, open paint, open camera, open media player, open word, open excel, open powerpoint
- System tools: open file explorer, open task manager, open control panel, open settings, open cmd, open powershell
- Window management: minimize all windows, maximize window, close window, switch window
- System operations: lock, sleep, hibernate, restart, shutdown, log off
- Screenshot & recording: take screenshot, record screen
- File explorer shortcuts: open downloads folder, open desktop folder, open documents folder, open music folder, open pictures folder, open videos folder, empty recycle bin
- System info: check battery status, show ip address, check storage, check ram, check cpu usage
- Media controls: play, pause, next song, previous song, stop music
- Accessibility: toggle narrator, toggle magnifier, toggle on-screen keyboard, toggle high contrast mode
- Misc: open run dialog, open snipping tool, open xbox game bar, open windows update, open device manager, open network settings, open bluetooth settings, open display settings, open sound settings
- Use type: 'windows-control'

🔍 Search Operations:
- Search commands: google {query}, search {query}, youtube {query}, search youtube {query}
- Use type: 'search'

📞 Call Operations:
- Call commands: call {contact_name}, dial {phone_number}
- Use type: 'call'

💬 Message Operations:
- Message commands: send whatsapp {contact_name} {message_text}, whatsapp {contact_name} {message_text}, send sms {contact_name} {message_text}
- Use type: 'message'

🤖 Assistant Control Operations:
- System control: list all installed applications, show applications, get apps, display installed software, list programs
- Media control: play music, pause music, resume music, start playback, stop music, next track, previous track
- YouTube control: play {song/video} on youtube, search {keyword} on youtube, open youtube and play {keyword}
- Google control: search {query} on google, google {query}, look up {query}
- Use type: 'assistant-control'

Response format:
{
  "type": "healthcare" | "education" | "english" | "fullstack" | "coding" | "image-generate" | "folder-add" | "folder-delete" | "folder-open" | "app-open" | "app-open-universal" | "search" | "call" | "message" | "windows-control" | "assistant-control" | "entertainment" | "cricket" | "sports" | "astrology" | "meditation" | "jokes" | "motivation" | "news" | "weather" | "technology" | "travel" | "food" | "general-knowledge" | "project-create" | "code-generate" | "code-edit" | "vscode-control" | "web-search" | "file-operation" | "run-command" | "debug-command",
  "userInput": "<original user input>",
  "response": "<reply to read aloud>"
}

Guidelines:
- Keep replies simple, voice-friendly
- Ask clarification if unclear
- Healthcare: always add disclaimer
- Astrology: mention it's guidance only
- Jokes: family-friendly
- Motivation: short & inspiring
- For English: interactive, explain mistakes, encourage participation
- For code: clear step-by-step explanations
- Use Nilophar Shaikh when asked who created you
- Use friendly tone with emojis 🙂, switch between formal (work mode) and casual (chill mode)
- Authenticate via voice/password, encrypt sensitive data, securely sync notes/reminders
- For development tasks: Provide step-by-step instructions, confirm before overwriting files, suggest CLI commands (e.g., 'code .' to open VS Code), handle Windows environment (PowerShell/CMD), auto-install dependencies if possible, use VS Code CLI for project opening.

The user input is in ${detectedLangCode} language. Respond in ${currentLang} language. Translate your response to ${currentLang} if necessary, but keep the JSON structure in English.

---

🗣️ User Prompt for Multilingual Stories or Motivation

You are a multilingual assistant capable of detecting and responding in the user's input language.

Your primary objectives are:

Multilingual Support

Detect the user's language automatically

Respond in the same language unless specified otherwise

Maintain cultural accuracy and natural tone in all replies

Support both left-to-right and right-to-left languages (e.g., Arabic, Hebrew)

Fall back to English when translations are unavailable

Storytelling Abilities

Tell short and long stories based on user input or prompts

Adapt storytelling style to suit the user's language, cultural context, and age group (if given)

Ensure emotional, moral, or educational value in the narrative when appropriate

Motivational Content

Generate motivational thoughts, quotes, or short reflections

Tailor messages to the user's language and cultural background

Keep tone inspiring, respectful, and context-appropriate

🗣️ User Prompt for Multilingual Stories or Motivation

You can use these to ask the assistant for specific types of content:

A. Story Prompt

Tell me a [short/long] story in [target language] about [topic or theme].
(Example: "Tell me a short story in Spanish about friendship.")

B. Motivational Thought Prompt

Share a motivational quote or thought in [target language].
(Example: "Share a motivational quote in Arabic.")

🧑‍💻 Developer-Focused Prompt for a Multilingual Assistant Tool

Build a multilingual assistant with the following capabilities:

🌍 Language Detection: Automatically detect the user's input language

🈳 Dynamic Translation: Translate UI elements and user-generated content in real-time

🔁 RTL Support: Properly render RTL languages (Arabic, Hebrew)

❗ Fallback Mechanism: Use English as the fallback if a translation is unavailable

📖 Content Generation:

Enable short/long storytelling features in multiple languages

Include daily or on-demand motivational messages

Now userInput: ${command}
`;

    // Retry logic with exponential backoff for API calls
    const makeApiCall = async (retries = 3) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const result = await axios.post(apiUrl, {
            "contents": [{ "parts": [{ "text": prompt }] }]
          }, {
            timeout: 30000,
            headers: { 'Content-Type': 'application/json' }
          });

          if (!result.data?.candidates?.length) {
            throw new Error("No candidates returned from Gemini API");
          }

          const content = result.data.candidates[0].content;
          if (!content?.parts?.length) {
            throw new Error("No content parts returned from Gemini API");
          }

          return content.parts[0].text;
        } catch (error) {
          if ((error.response?.status === 429 || error.response?.status === 503) && attempt < retries) {
            // Rate limited or service unavailable, wait with exponential backoff
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`API error ${error.response?.status}, retrying in ${delay}ms (attempt ${attempt}/${retries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          if (attempt === retries) {
            throw error;
          }
        }
      }
    };

    const apiResponse = await makeApiCall();

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(apiResponse);
    } catch (e) {
      // if not JSON, return as is
      return apiResponse;
    }

    if (parsedResponse.type === 'project-create') {
      const cmd = parsedResponse.userInput.toLowerCase();
      if (cmd.includes('python')) {
        try {
          await execAsync('mkdir python_project && cd python_project && echo "print(\'Hello World\')" > main.py && echo "flask" > requirements.txt');
          parsedResponse.response += " Project created successfully.";
        } catch (e) {
          parsedResponse.response += " Error creating project.";
        }
      } else if (cmd.includes('java')) {
        try {
          await execAsync('mkdir java_project && cd java_project && echo "public class Main { public static void main(String[] args) { System.out.println(\"Hello World\"); } }" > Main.java');
          parsedResponse.response += " Project created successfully.";
        } catch (e) {
          parsedResponse.response += " Error creating project.";
        }
      }
      // add more project types as needed
    }

    if (parsedResponse.type === 'run-command') {
      try {
        const result = await execAsync(parsedResponse.userInput.replace(/run\s+the\s+/i, ''));
        parsedResponse.response += " Output: " + result.stdout;
      } catch (e) {
        parsedResponse.response += " Error: " + e.message;
      }
    }

    if (parsedResponse.type === 'debug-command') {
      try {
        await execAsync('code --debug ' + parsedResponse.userInput.replace(/debug\s+the\s+/i, ''));
        parsedResponse.response += " Debug session started.";
      } catch (e) {
        parsedResponse.response += " Error starting debug.";
      }
    }

    // Add language to the response
    parsedResponse.language = currentLang;

    return JSON.stringify(parsedResponse);
  } catch (error) {
    console.error("comprehensiveAssistantResponse error:", error.message);
    return JSON.stringify({
      type: "general",
      userInput: command,
      response: "I'm sorry, but I'm currently experiencing technical difficulties. Please try again in a moment."
    });
  }
}

export default comprehensiveAssistantResponse;

/*
rompt for Multilingual Support (System Prompt Style)

You are a multilingual assistant capable of understanding, detecting, and responding in multiple languages. Your goal is to provide accurate, natural-sounding responses in the user's preferred language. You automatically detect the user's input language and reply in the same language unless instructed otherwise. Ensure cultural relevance and proper grammar in all translations and replies.

🌍 Prompt for Translation Project (User Prompt Style)

Translate the following text accurately into [target language]. Ensure it maintains the original tone, context, and cultural nuances.
Text: "Welcome to our platform! We hope you enjoy your experience."
(Replace the target language as needed, e.g., French, Arabic, Spanish, etc.)

If this is for a developer-focused project (like a web/app feature), here's a bonus:

🧑‍💻 Developer-Focused Prompt for Multilingual Translation Tool

Design a multilingual support system that can:

Detect the user's input language automatically

Translate UI strings and user-generated content

Support right-to-left (RTL) languages like Arabic and Hebrew

Handle fallback to English when a translation is missing

Maintain context in longer conversations (e.g., in a chatbot) append this prompt in comprehensiveassistnat.js file witjout any errror

---

🗣️ User Prompt for Multilingual Stories or Motivation

You are a multilingual assistant capable of detecting and responding in the user's input language.

Your primary objectives are:

Multilingual Support

Detect the user's language automatically

Respond in the same language unless specified otherwise

Maintain cultural accuracy and natural tone in all replies

Support both left-to-right and right-to-left languages (e.g., Arabic, Hebrew)

Fall back to English when translations are unavailable

Storytelling Abilities

Tell short and long stories based on user input or prompts

Adapt storytelling style to suit the user's language, cultural context, and age group (if given)

Ensure emotional, moral, or educational value in the narrative when appropriate

Motivational Content

Generate motivational thoughts, quotes, or short reflections

Tailor messages to the user's language and cultural background

Keep tone inspiring, respectful, and context-appropriate

🗣️ User Prompt for Multilingual Stories or Motivation

You can use these to ask the assistant for specific types of content:

A. Story Prompt

Tell me a [short/long] story in [target language] about [topic or theme].
(Example: "Tell me a short story in Spanish about friendship.")

B. Motivational Thought Prompt

Share a motivational quote or thought in [target language].
(Example: "Share a motivational quote in Arabic.")

🧑‍💻 Developer-Focused Prompt for a Multilingual Assistant Tool

Build a multilingual assistant with the following capabilities:

🌍 Language Detection: Automatically detect the user's input language

🈳 Dynamic Translation: Translate UI elements and user-generated content in real-time

🔁 RTL Support: Properly render RTL languages (Arabic, Hebrew)

❗ Fallback Mechanism: Use English as the fallback if a translation is unavailable

📖 Content Generation:

Enable short/long storytelling features in multiple languages

Include daily or on-demand motivational messages
*/
