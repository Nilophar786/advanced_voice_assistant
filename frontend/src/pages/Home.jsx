import React, { useContext, useEffect, useRef, useState } from 'react'
import { userDataContext } from '../context/UserContext.jsx'
import { useNavigate, useLocation } from 'react-router-dom'
import axios from 'axios'
import aiImg from "../assets/nilo1.gif"
import { CgMenuRight } from "react-icons/cg";
import { RxCross1 } from "react-icons/rx";
import userImg from "../assets/nilo.gif"
import HamburgerMenu from '../components/HamburgerMenu';
import ParticleBackground from '../components/ParticleBackground';
import AnimatedAvatar from '../components/AnimatedAvatar';
import { openPopup } from '../utils/popupUtils.js';

import ModernButton from '../components/ModernButton';
import ModernToggle from '../components/ModernToggle';
import FloatingActions from '../components/FloatingActions';
import DynamicGreeting from '../components/DynamicGreeting';
import SmartWidgetDashboard from '../components/SmartWidgetDashboard';
import WeatherModal from '../components/WeatherModal';
import { motion, AnimatePresence } from 'framer-motion';
function Home() {
  const {userData, serverUrl, setUserData, getAssistantResponse, loading, error} = useContext(userDataContext)

  const navigate = useNavigate()
  const location = useLocation();

  // Handle navigation based on userData loading state
  useEffect(() => {
    // Only redirect to customize if userData is loaded but missing required fields
    if (userData && (!userData.name || !userData.assistantName || !userData.assistantImage)) {
      navigate("/customize");
    }
  }, [userData, loading, error, navigate]);

  // Show loading screen while userData is being fetched
  if (loading) {
    return (
      <div className="w-full h-[100vh] bg-gradient-to-br from-black via-purple-900/20 to-black flex justify-center items-center flex-col gap-[15px] fixed inset-0 overflow-hidden">
        <div className="text-white text-2xl font-semibold">Loading...</div>
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }



  // Don't render anything if userData is not available (will redirect via useEffect)
  if (!userData) {
    return null;
  }
  const [userText,setUserText]=useState("")
  const [aiText,setAiText]=useState("")
  const [chatMessages, setChatMessages] = useState([])  // Added for chatbot messages
  const [chatInput, setChatInput] = useState("")       // Added for chat input
  const isSpeakingRef=useRef(false)
  const recognitionRef=useRef(null)
  const [ham,setHam]=useState(false)
  const isRecognizingRef=useRef(false)
  const synth=window.speechSynthesis
  const isMountedRef = useRef(true);
  const [consoleMessages, setConsoleMessages] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isManualStop, setIsManualStop] = useState(false);

  // Simple string similarity function for fuzzy matching
  const similarity = (str1, str2) => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = (s1, s2) => {
      s1 = s1.toLowerCase();
      s2 = s2.toLowerCase();

      const costs = [];
      for (let i = 0; i <= s1.length; i++) {
        let lastValue = i;
        for (let j = 0; j <= s2.length; j++) {
          if (i === 0) costs[j] = j;
          else {
            if (j > 0) {
              let newValue = costs[j - 1];
              if (s1.charAt(i - 1) !== s2.charAt(j - 1))
                newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
              costs[j - 1] = lastValue;
              lastValue = newValue;
            }
          }
        }
        if (i > 0) costs[s2.length] = lastValue;
      }
      return costs[s2.length];
    };

    return (longer.length - editDistance(longer, shorter)) / longer.length;
  };

  console.log("Home component rendered");

  const handleLogOut=async ()=>{
    console.log("handleLogOut called");
    try {
      const result=await axios.get(`${serverUrl}/api/auth/logout`,{withCredentials:true})
      console.log("handleLogOut result:", result.data);
      setUserData(null)
      navigate("/signin")
    } catch (error) {
      console.log("handleLogOut error:", error);
      setUserData(null)
    }
  }

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const newMessage = { sender: "user", text: chatInput.trim() };
    setChatMessages((prev) => [...prev, newMessage]);
    setChatInput("");

    // Send the message to the backend AI assistant
    const data = await getAssistantResponse(chatInput.trim());
    if (data && data.response) {
      const aiMessage = { sender: "assistant", text: data.response };
      setChatMessages((prev) => [...prev, aiMessage]);
    } else {
      const errorMessage = { sender: "assistant", text: "Sorry, I encountered an error processing your request." };
      setChatMessages((prev) => [...prev, errorMessage]);
    }
  };

  const startRecognition = () => {
    console.log("startRecognition called");
   if (!isSpeakingRef.current && !isRecognizingRef.current) {
    try {
      recognitionRef.current?.start();
      console.log("Recognition requested to start");
    } catch (error) {
      if (error.name !== "InvalidStateError") {
        console.error("Start error:", error);
      }
    }
  }

  }

  const speak=(text, language = 'hi')=>{
    console.log("speak called with text:", text, "language:", language);
    // Cancel any ongoing speech to avoid queuing
    synth.cancel();

    const utterence=new SpeechSynthesisUtterance(text)

    // Map language to langCode
    let langCode = 'en-US'; // default
    if (language === 'hi') langCode = 'hi-IN';
    else if (language === 'es') langCode = 'es-ES';
    else if (language === 'fr') langCode = 'fr-FR';
    else if (language === 'de') langCode = 'de-DE';
    else if (language === 'it') langCode = 'it-IT';
    else if (language === 'pt') langCode = 'pt-BR';
    else if (language === 'ja') langCode = 'ja-JP';
    else if (language === 'ko') langCode = 'ko-KR';
    else if (language === 'zh') langCode = 'zh-CN';
    else if (language === 'gu') langCode = 'gu-IN';
    // Add more mappings as needed

    utterence.lang = langCode;

    const voices = window.speechSynthesis.getVoices()
    // Find voice that matches the language
    const voice = voices.find(v => v.lang.startsWith(langCode.split('-')[0]));
    if (voice) {
      utterence.voice = voice;
    }

    // Make the assistant more responsive by reducing delays
    isSpeakingRef.current=true
    setIsSpeaking(true);
    utterence.onend=()=>{
        console.log("Speech ended");
        setAiText("");
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        // Further reduced delay from 300ms to 150ms for even faster response
        setTimeout(() => {
          startRecognition();
        }, 150);
    }

    synth.speak(utterence);
  }

  const handleStop = () => {
    console.log("Stop button clicked");
    setIsManualStop(true);

    // Cancel any ongoing speech synthesis
    synth.cancel();

    // Stop recognition if it's active
    if (recognitionRef.current && isRecognizingRef.current) {
      try {
        recognitionRef.current.stop();
        console.log("Recognition stopped successfully");
      } catch (error) {
        console.error("Error stopping recognition:", error);
      }
    }

    // Reset all states
    setIsSpeaking(false);
    setIsListening(false);
    isRecognizingRef.current = false;
    isSpeakingRef.current = false;

    // Clear any pending timeouts that might restart recognition
    if (window.recognitionRestartTimeout) {
      clearTimeout(window.recognitionRestartTimeout);
      window.recognitionRestartTimeout = null;
    }

    console.log("All speech functions stopped");
  };

  const handleContinue = () => {
    console.log("Continue button clicked");
    if (!isSpeaking && !isListening && isManualStop) {
      setIsManualStop(false);
      console.log("Resuming speech recognition");
      startRecognition();
    }
  };

  // Teacher lesson data
  const teacherLessons = {
    'english-teacher': [
      {
        id: 1,
        title: 'Introduction to Grammar',
        description: 'Learn the basics of English grammar including parts of speech and sentence structure.',
        content: `Welcome to your English Grammar lesson!

Today's lesson covers the fundamentals of English grammar:

1. PARTS OF SPEECH
- Nouns: People, places, things, ideas (dog, London, happiness)
- Verbs: Action or state words (run, think, be)
- Adjectives: Describe nouns (big, red, happy)
- Adverbs: Describe verbs, adjectives, or other adverbs (quickly, very, well)

2. SENTENCE STRUCTURE
- Subject: Who or what the sentence is about
- Predicate: What the subject does or is
- Example: "The quick brown fox jumps over the lazy dog."

3. BASIC RULES
- Every sentence needs a subject and a verb
- Capitalize the first word of each sentence
- End sentences with appropriate punctuation

Practice these concepts in your daily conversations!`,
        exercises: `EXERCISE 1: Identify Parts of Speech
Read this sentence: "The happy children quickly ran to the colorful playground."
- Nouns: __________
- Verbs: __________
- Adjectives: __________
- Adverbs: __________

EXERCISE 2: Create Your Own Sentences
Write 3 sentences using:
1. At least one noun and one verb
2. An adjective to describe something
3. An adverb to describe an action

EXERCISE 3: Fix These Sentences
1. "the cat sleeping on mat" → __________
2. "she sing beautiful" → __________
3. "we going to school yesterday" → __________`
      },
      {
        id: 2,
        title: 'Advanced Vocabulary Building',
        description: 'Expand your vocabulary with synonyms, antonyms, and context clues.',
        content: `Welcome to Advanced Vocabulary Building!

Today we'll learn how to expand your English vocabulary:

1. SYNONYMS AND ANTONYMS
- Synonyms: Words with similar meanings (big/large, happy/joyful)
- Antonyms: Words with opposite meanings (hot/cold, fast/slow)

2. CONTEXT CLUES
- Use surrounding words to understand new vocabulary
- Example: "The arduous journey through the mountains was difficult but rewarding."
  (arduous = difficult, challenging)

3. WORD FAMILIES
- Learn related words: act, action, actor, actress, active
- This helps you remember and use new words more easily

4. VOCABULARY BUILDING STRATEGIES
- Read regularly and note unfamiliar words
- Use new words in sentences immediately
- Group words by theme (food, emotions, technology)

Practice using sophisticated vocabulary in your daily conversations!`,
        exercises: `EXERCISE 1: Synonyms Challenge
Find synonyms for these words:
1. Happy: __________
2. Big: __________
3. Run: __________
4. Beautiful: __________

EXERCISE 2: Context Clues
Read and define the underlined words:
1. "The meeting was protracted, lasting much longer than expected." protracted = __________
2. "Her benevolent nature made her popular with everyone." benevolent = __________
3. "The scientist made a profound discovery about the universe." profound = __________

EXERCISE 3: Word Families
Complete these word families:
1. Teach: teacher, teaching, __________, __________
2. Write: writer, writing, __________, __________
3. Create: creator, creation, __________, __________`
      },
      {
        id: 3,
        title: 'Writing Skills & Composition',
        description: 'Learn to write clear, effective essays and compositions.',
        content: `Welcome to Writing Skills & Composition!

Today we'll learn the art of effective writing:

1. ESSAY STRUCTURE
- Introduction: Hook, background, thesis statement
- Body: Main points with supporting evidence
- Conclusion: Restate thesis, summarize, final thoughts

2. PARAGRAPH DEVELOPMENT
- Topic sentence: Main idea of the paragraph
- Supporting sentences: Details and examples
- Concluding sentence: Wrap up the paragraph

3. WRITING TECHNIQUES
- Use active voice: "The cat chased the mouse" (not "The mouse was chased by the cat")
- Vary sentence length: Mix short and long sentences
- Show, don't tell: "Her eyes widened in terror" instead of "She was scared"

4. EDITING AND REVISING
- Read your work aloud to catch errors
- Check for clarity and flow
- Eliminate unnecessary words

Remember: Good writing is rewriting!`,
        exercises: `EXERCISE 1: Essay Outline
Create an outline for: "Why Reading is Important"
I. Introduction
   A. __________
   B. __________
   C. __________

II. Body
   A. __________
   B. __________
   C. __________

III. Conclusion
   A. __________
   B. __________

EXERCISE 2: Paragraph Writing
Write a paragraph about your favorite hobby. Include:
- Topic sentence
- 3-4 supporting details
- Concluding sentence

EXERCISE 3: Editing Practice
Edit this paragraph:
"Writing is a important skill that everyone should learn. It helps you to express your ideas clearly. Their are many benefits to good writing skills. You can communicate better with others. Writing also helps you think more clearly about your own thoughts."

Corrected version: ________________`
      }
    ],
    'fullstack-teacher': [
      {
        id: 1,
        title: 'HTML Fundamentals',
        description: 'Learn the basics of HTML structure, tags, and semantic elements.',
        content: `Welcome to HTML Fundamentals!

HTML (HyperText Markup Language) is the foundation of web development.

1. BASIC STRUCTURE
<!DOCTYPE html>
<html>
  <head>
    <title>My First Webpage</title>
  </head>
  <body>
    <h1>Hello World!</h1>
    <p>This is my first webpage.</p>
  </body>
</html>

2. COMMON HTML TAGS
- <h1> to <h6>: Headings (h1 is largest)
- <p>: Paragraphs
- <a href="url">Link text</a>: Links
- <img src="image.jpg" alt="description">: Images
- <ul> and <li>: Unordered lists
- <ol> and <li>: Ordered lists

3. SEMANTIC HTML
- <header>: Page or section header
- <nav>: Navigation menu
- <main>: Main content area
- <article>: Self-contained content
- <section>: Thematic grouping
- <footer>: Page or section footer

4. ATTRIBUTES
- id: Unique identifier
- class: CSS styling
- href: Link destination
- src: Image source
- alt: Image description (accessibility)

Start building your first webpage today!`,
        exercises: `EXERCISE 1: Create Your First HTML Page
Create an HTML file with:
1. Proper DOCTYPE and structure
2. A main heading with your name
3. A paragraph about yourself
4. A link to your favorite website
5. An image (use a placeholder if needed)

EXERCISE 2: HTML Structure Practice
Write the HTML for a simple blog post:
- Header with site title
- Navigation menu
- Main article with heading and content
- Footer with copyright

EXERCISE 3: Semantic HTML Challenge
Convert this basic HTML to semantic HTML:
<div id="header">My Blog</div>
<div id="nav">Home About Contact</div>
<div id="content">Article content here...</div>
<div id="footer">© 2024</div>

Semantic version: ________________`
      },
      {
        id: 2,
        title: 'CSS Styling & Layout',
        description: 'Learn CSS for styling, layouts, and responsive design.',
        content: `Welcome to CSS Styling & Layout!

CSS (Cascading Style Sheets) makes your websites beautiful and responsive.

1. BASIC CSS SYNTAX
selector {
  property: value;
  property: value;
}

Examples:
h1 {
  color: blue;
  font-size: 24px;
}

.purple-text {
  color: purple;
}

2. BOX MODEL
Every element has:
- Content: The actual content
- Padding: Space inside the border
- Border: Around padding
- Margin: Space outside the border

3. FLEXBOX LAYOUT
.container {
  display: flex;
  justify-content: center;
  align-items: center;
}

4. RESPONSIVE DESIGN
@media (max-width: 768px) {
  .container {
    flex-direction: column;
  }
}

5. COMMON PROPERTIES
- color: Text color
- background-color: Background color
- font-size: Text size
- margin/padding: Spacing
- border: Element borders
- display: Layout type

Make your websites responsive and beautiful!`,
        exercises: `EXERCISE 1: Style a Simple Page
Create CSS for:
1. Blue heading with large font
2. Red paragraph text
3. Yellow background for the body
4. Center-aligned content

EXERCISE 2: Flexbox Layout
Create a navigation bar with:
- Horizontal layout
- Equal spacing between items
- Center alignment
- Hover effects

EXERCISE 3: Responsive Design
Create a layout that:
- Shows 3 columns on desktop
- Shows 2 columns on tablet
- Shows 1 column on mobile
- Adjusts font sizes for each screen size`
      },
      {
        id: 3,
        title: 'JavaScript Interactivity',
        description: 'Add dynamic behavior to your websites with JavaScript.',
        content: `Welcome to JavaScript Interactivity!

JavaScript makes your websites interactive and dynamic.

1. BASIC JAVASCRIPT
// Variables
let name = "John";
const age = 25;

// Functions
function greetUser() {
  console.log("Hello, " + name + "!");
}

// Event Listeners
button.addEventListener('click', function() {
  alert('Button clicked!');
});

2. DOM MANIPULATION
// Get elements
const heading = document.querySelector('h1');
const button = document.getElementById('myButton');

// Change content
heading.textContent = 'New Title';
button.style.backgroundColor = 'blue';

3. ARRAYS AND OBJECTS
// Arrays
const fruits = ['apple', 'banana', 'orange'];

// Objects
const person = {
  name: 'John',
  age: 25,
  greet: function() {
    return 'Hello!';
  }
};

4. CONDITIONAL STATEMENTS
if (age >= 18) {
  console.log('Adult');
} else {
  console.log('Minor');
}

5. LOOPS
for (let i = 0; i < 5; i++) {
  console.log('Count: ' + i);
}

Make your websites come alive with JavaScript!`,
        exercises: `EXERCISE 1: Interactive Button
Create a button that:
1. Changes color when clicked
2. Shows an alert message
3. Updates text content

EXERCISE 2: Simple Calculator
Create a basic calculator with:
1. Two input fields for numbers
2. Add, subtract, multiply buttons
3. Display result area

EXERCISE 3: Dynamic List
Create a todo list that:
1. Allows adding new items
2. Has delete buttons for each item
3. Updates the display dynamically`
      },
      {
        id: 4,
        title: 'React Components',
        description: 'Learn React components, props, and state management.',
        content: `Welcome to React Components!

React is a powerful library for building user interfaces.

1. REACT COMPONENTS
// Functional Component
function Welcome(props) {
  return <h1>Hello, {props.name}!</h1>;
}

// Class Component
class Welcome extends React.Component {
  render() {
    return <h1>Hello, {this.props.name}!</h1>;
  }
}

2. JSX SYNTAX
- HTML-like syntax in JavaScript
- Use curly braces for JavaScript expressions
- Components must return a single root element
- Use className instead of class

3. PROPS
- Pass data from parent to child components
- Read-only data (immutable)
- Used for component configuration
- Can be strings, numbers, objects, functions

4. STATE
- Mutable data managed within components
- Use useState hook in functional components
- Trigger re-renders when updated
- Used for interactive component data

React makes building complex UIs manageable!`,
        exercises: `EXERCISE 1: Create a Component
Build a UserCard component that displays:
1. User name and avatar
2. User bio/description
3. Contact button

EXERCISE 2: Props Practice
Create a ProductCard component that accepts:
1. Product name (string)
2. Price (number)
3. Image URL (string)
4. In stock status (boolean)

EXERCISE 3: State Management
Build a Counter component with:
1. Display current count
2. Increment button
3. Decrement button
4. Reset button
5. Use useState hook`
      },
      {
        id: 5,
        title: 'Node.js Backend',
        description: 'Build server-side applications with Node.js and Express.',
        content: `Welcome to Node.js Backend Development!

Node.js allows you to run JavaScript on the server.

1. NODE.JS BASICS
- Server-side JavaScript runtime
- Non-blocking, event-driven architecture
- Single-threaded with event loop
- Perfect for I/O intensive applications

2. EXPRESS FRAMEWORK
const express = require('express');
const app = express();

// Middleware
app.use(express.json());

// Routes
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

// Server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});

3. RESTful APIs
- GET: Retrieve data
- POST: Create new resources
- PUT: Update existing resources
- DELETE: Remove resources
- Status codes: 200, 201, 400, 404, 500

4. MIDDLEWARE
- Functions that process requests
- Can modify request/response objects
- Used for logging, authentication, validation
- Execute in order they're defined

Node.js powers modern web applications!`,
        exercises: `EXERCISE 1: Simple Express Server
Create a basic Express server with:
1. GET / route returning "Hello World"
2. GET /about route with JSON response
3. POST /users route for creating users
4. Error handling middleware

EXERCISE 2: REST API Design
Design API endpoints for a blog system:
1. GET /posts - Get all posts
2. GET /posts/:id - Get single post
3. POST /posts - Create new post
4. PUT /posts/:id - Update post
5. DELETE /posts/:id - Delete post

EXERCISE 3: Middleware Implementation
Create middleware for:
1. Request logging (method, URL, timestamp)
2. JSON body parsing
3. CORS headers
4. Authentication check
5. Error handling`
      },
      {
        id: 6,
        title: 'Database Integration',
        description: 'Connect your applications to databases using MongoDB and SQL.',
        content: `Welcome to Database Integration!

Learn to connect your applications to databases.

1. MONGODB WITH MONGOOSE
const mongoose = require('mongoose');

// Schema definition
const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  age: Number
});

// Model
const User = mongoose.model('User', userSchema);

// Operations
// Create
const user = new User({ name: 'John', email: 'john@example.com' });
await user.save();

// Read
const users = await User.find();

// Update
await User.findByIdAndUpdate(id, { name: 'Jane' });

// Delete
await User.findByIdAndDelete(id);

2. SQL DATABASES
const mysql = require('mysql2');

// Connection
const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'mydatabase'
});

// Query
connection.query('SELECT * FROM users', (err, results) => {
  console.log(results);
});

3. DATABASE DESIGN
- Normalization: Reduce data redundancy
- Relationships: One-to-many, many-to-many
- Indexes: Improve query performance
- Constraints: Ensure data integrity

4. ORM/ODM
- Object-Relational Mapping tools
- Sequelize for SQL databases
- Mongoose for MongoDB
- Simplify database operations

Data persistence is crucial for modern applications!`,
        exercises: `EXERCISE 1: User Model
Create a Mongoose schema for a User with:
1. Name (required string)
2. Email (required, unique)
3. Password (required)
4. Age (optional number)
5. Created date (timestamp)
6. Profile picture URL (optional)

EXERCISE 2: CRUD Operations
Implement full CRUD operations:
1. Create user endpoint
2. Get all users endpoint
3. Get user by ID endpoint
4. Update user endpoint
5. Delete user endpoint

EXERCISE 3: Database Queries
Write queries for:
1. Find users older than 25
2. Find users with Gmail accounts
3. Sort users by name alphabetically
4. Limit results to 10 users
5. Count total number of users`
      },
      {
        id: 7,
        title: 'Authentication & Security',
        description: 'Implement user authentication and security best practices.',
        content: `Welcome to Authentication & Security!

Learn to secure your web applications.

1. PASSWORD HASHING
const bcrypt = require('bcrypt');

// Hash password
const saltRounds = 10;
const hashedPassword = await bcrypt.hash(password, saltRounds);

// Verify password
const isValid = await bcrypt.compare(password, hashedPassword);

2. JWT AUTHENTICATION
const jwt = require('jsonwebtoken');

// Generate token
const token = jwt.sign({ userId: user.id }, 'secretKey', {
  expiresIn: '24h'
});

// Verify token
try {
  const decoded = jwt.verify(token, 'secretKey');
} catch (err) {
  // Token invalid or expired
}

3. AUTHENTICATION MIDDLEWARE
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.sendStatus(401);

  jwt.verify(token, 'secretKey', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

4. SECURITY BEST PRACTICES
- Use HTTPS in production
- Validate and sanitize user input
- Implement rate limiting
- Use security headers (helmet.js)
- Regular security audits

Security is not optional - it's essential!`,
        exercises: `EXERCISE 1: Registration System
Create user registration with:
1. Input validation (email format, password strength)
2. Password hashing with bcrypt
3. Duplicate email check
4. User creation in database
5. Success/error responses

EXERCISE 2: Login System
Implement user login with:
1. Email/password validation
2. Password verification
3. JWT token generation
4. Token expiration handling
5. Secure cookie storage

EXERCISE 3: Protected Routes
Create middleware and routes for:
1. Authentication middleware
2. Protected user profile route
3. Protected admin routes
4. Logout functionality
5. Token refresh mechanism`
      },
      {
        id: 8,
        title: 'API Development',
        description: 'Build robust RESTful APIs with proper error handling.',
        content: `Welcome to API Development!

Learn to build professional APIs.

1. RESTful API DESIGN
- Resource-based URLs (/api/users, /api/posts)
- HTTP methods (GET, POST, PUT, DELETE)
- Status codes (200, 201, 400, 404, 500)
- Consistent response format

2. ERROR HANDLING
// Custom error class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

// Error middleware
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Handle different error types
  if (err.name === 'ValidationError') {
    error = handleValidationError(err);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error'
  });
};

3. API DOCUMENTATION
- Swagger/OpenAPI for documentation
- Request/response examples
- Authentication requirements
- Error code explanations

4. API TESTING
- Postman for manual testing
- Unit tests for API endpoints
- Integration tests for workflows
- Load testing for performance

Well-designed APIs are easy to use and maintain!`,
        exercises: `EXERCISE 1: API Response Format
Design a consistent response format:
{
  "success": true,
  "data": { ... },
  "message": "Operation successful",
  "timestamp": "2024-01-01T00:00:00Z"
}

Implement for:
1. Successful GET request
2. Successful POST request
3. Error responses
4. Pagination responses

EXERCISE 2: Error Handling
Create error handling for:
1. Invalid request data (400)
2. Resource not found (404)
3. Server errors (500)
4. Authentication errors (401)
5. Authorization errors (403)

EXERCISE 3: API Endpoints
Build a complete API for a task management system:
1. GET /api/tasks - List all tasks
2. POST /api/tasks - Create task
3. GET /api/tasks/:id - Get task
4. PUT /api/tasks/:id - Update task
5. DELETE /api/tasks/:id - Delete task
6. GET /api/tasks?status=completed - Filter tasks`
      },
      {
        id: 9,
        title: 'Full Stack Project',
        description: 'Build a complete full-stack application from scratch.',
        content: `Welcome to Full Stack Project Development!

Let's build a complete application together.

1. PROJECT PLANNING
- Define requirements and features
- Choose technology stack
- Design database schema
- Plan API endpoints
- Create user interface mockups

2. PROJECT STRUCTURE
my-app/
├── backend/
│   ├── models/
│   ├── routes/
│   ├── controllers/
│   └── middleware/
├── frontend/
│   ├── components/
│   ├── pages/
│   ├── services/
│   └── utils/
└── database/
    └── migrations/

3. DEVELOPMENT WORKFLOW
- Set up development environment
- Create basic project structure
- Implement backend API
- Build frontend interface
- Connect frontend to backend
- Test and debug
- Deploy application

4. BEST PRACTICES
- Version control with Git
- Code organization and structure
- Error handling and logging
- Security considerations
- Performance optimization

Building full-stack applications is rewarding and challenging!`,
        exercises: `EXERCISE 1: Project Planning
Plan a blog application with:
1. User authentication (register/login)
2. Post creation and editing
3. Comment system
4. User profiles
5. Admin panel

List:
- Required features
- Database schema
- API endpoints
- UI components

EXERCISE 2: Technology Stack
Choose appropriate technologies for:
1. Frontend framework (React, Vue, Angular)
2. Backend framework (Express, Fastify, NestJS)
3. Database (MongoDB, PostgreSQL, MySQL)
4. Authentication (JWT, OAuth, Session)
5. State management (Redux, Context, Zustand)

EXERCISE 3: Implementation Steps
Break down the project into tasks:
1. Set up project structure
2. Implement user authentication
3. Create post management system
4. Build user interface
5. Add commenting functionality
6. Implement admin features
7. Add styling and responsive design
8. Test and deploy

Create a detailed task list with priorities and dependencies.`
      },
      {
        id: 10,
        title: 'Deployment & DevOps',
        description: 'Deploy your applications and learn DevOps fundamentals.',
        content: `Welcome to Deployment & DevOps!

Learn to deploy and manage your applications.

1. DEPLOYMENT PLATFORMS
- Heroku: Easy cloud deployment
- Vercel: Optimized for frontend apps
- AWS: Scalable cloud infrastructure
- DigitalOcean: Affordable cloud hosting
- Netlify: Static site hosting

2. DOCKER CONTAINERS
# Dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]

# Docker Compose
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
  mongodb:
    image: mongo:latest
    ports:
      - "27017:27017"

3. CI/CD PIPELINES
- GitHub Actions: Automated workflows
- GitLab CI: Built-in CI/CD
- Jenkins: Customizable automation
- Travis CI: Simple integration

4. MONITORING & LOGGING
- Application performance monitoring
- Error tracking and alerting
- Log aggregation and analysis
- Database performance monitoring

Deploying applications requires planning and automation!`,
        exercises: `EXERCISE 1: Docker Setup
Create Docker configuration for:
1. Node.js application
2. MongoDB database
3. Nginx web server
4. Redis cache

EXERCISE 2: Deployment Script
Write a deployment script that:
1. Builds the application
2. Runs tests
3. Creates Docker images
4. Pushes to registry
5. Deploys to server
6. Runs database migrations

EXERCISE 3: Monitoring Setup
Set up monitoring for:
1. Application uptime
2. Response times
3. Error rates
4. Database performance
5. Server resources (CPU, memory, disk)

Create alerts for:
- High error rates
- Slow response times
- Server resource usage
- Failed deployments`
      }
    ]
  };

  const handleCommand = async (data) => {
    console.log("handleCommand called with data:", data);
    const { type, userInput, response } = data;

    // Handle teacher commands
    if (type === 'teacher-start') {
      const teacherType = userInput.replace('-teacher', '');
      const teacher = {
        'english': { title: 'English Teacher', icon: '📚' },
        'fullstack': { title: 'Full Stack Development Teacher', icon: '💻' }
      }[teacherType];

      if (teacher) {
        setCurrentTeacher(teacher);
        setCurrentLesson(teacherLessons[teacherType + '-teacher'][0]);
        setShowLessonModal(true);
        speak(`Starting your ${teacher.title} lesson! Let's begin with the fundamentals.`);
      }
      return;
    }

    if (type === 'teacher-progress') {
      // Mock progress data - in real app this would come from backend
      const mockProgress = [
        {
          teacherName: 'English Teacher',
          completedLessons: 2,
          totalLessons: 5,
          lastActivity: new Date().toISOString()
        },
        {
          teacherName: 'Full Stack Development Teacher',
          completedLessons: 1,
          totalLessons: 8,
          lastActivity: new Date(Date.now() - 86400000).toISOString()
        }
      ];
      setTeacherProgress(mockProgress);
      setShowProgressModal(true);
      speak("Here's your learning progress across all subjects.");
      return;
    }

    if (type === 'teacher-ask') {
      setShowAskModal(true);
      speak("What would you like to ask your teacher? Please select a teacher and type your question.");
      return;
    }

    speak(data.response, data.language || 'hi');

    // Define popup configurations for different types
    const popupConfigs = {
      'google-search': {
        url: `https://www.google.com/search?q=${encodeURIComponent(userInput)}`,
        fallbackMessage: "I'm trying to open Google search for you, but your browser is blocking popups. Please allow popups for this site."
      },
      'calculator-open': {
        url: 'https://www.google.com/search?q=calculator',
        fallbackMessage: "I'm trying to open calculator for you, but your browser is blocking popups. Please allow popups for this site."
      },
      'instagram-open': {
        url: 'https://www.instagram.com/',
        fallbackMessage: "I'm trying to open Instagram for you, but your browser is blocking popups. Please allow popups for this site."
      },
      'facebook-open': {
        url: 'https://www.facebook.com/',
        fallbackMessage: "I'm trying to open Facebook for you, but your browser is blocking popups. Please allow popups for this site."
      },
      'weather-show': {
        url: 'https://www.google.com/search?q=weather',
        fallbackMessage: "I'm trying to show weather information for you, but your browser is blocking popups. Please allow popups for this site."
      },
      'weather-modal': {
        // This will be handled separately below
      },
      'youtube-open': {
        url: 'https://www.youtube.com/',
        fallbackMessage: "I'm trying to open YouTube for you, but your browser is blocking popups. Please allow popups for this site and try again.",
        successMessage: "Opening YouTube for you now."
      },
      'youtube-search': {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(userInput)}`,
        fallbackMessage: "I'm trying to open YouTube for you, but your browser is blocking popups. Please allow popups for this site and try again.",
        successMessage: "Opening YouTube with your search results"
      },
      'youtube-play': {
        url: `https://www.youtube.com/results?search_query=${encodeURIComponent(userInput)}`,
        fallbackMessage: "I'm trying to open YouTube for you, but your browser is blocking popups. Please allow popups for this site and try again.",
        successMessage: "Opening YouTube with your search results"
      }
    };

    // Handle popup-based commands
    if (popupConfigs[type]) {
      const config = popupConfigs[type];
      const success = openPopup(config.url, config.fallbackMessage, speak);

      if (success && config.successMessage) {
        speak(config.successMessage);
      }
      return;
    }

    // Handle weather-modal commands
    if (type === 'weather-modal') {
      console.log("Weather modal command received");
      setWeatherLoading(true);
      setWeatherError(null);
      setShowWeatherModal(true);

      try {
        // Extract city from userInput or use default
        const city = userInput.replace('weather', '').trim() || 'London';

        const response = await axios.get(`${serverUrl}/api/weather?city=${encodeURIComponent(city)}`, {
          withCredentials: true
        });

        if (response.data && response.data.success) {
          setWeatherData(response.data.data);
          speak(`Here's the weather information for ${response.data.data.location}.`);
        } else {
          throw new Error('Invalid response format');
        }
      } catch (error) {
        console.error('Weather fetch error:', error);
        setWeatherError('Unable to fetch weather data. Please try again.');
        speak('Sorry, I was unable to fetch the weather information. Please try again.');
      } finally {
        setWeatherLoading(false);
      }
      return;
    }

    // Handle desktop opening (special case)
    if (type === 'desktop-open') {
      console.log("Desktop open command received");
      try {
        // Since browsers cannot directly access local file system,
        // we'll provide helpful instructions and alternative solutions
        const userAgent = navigator.userAgent.toLowerCase();
        const isWindows = userAgent.includes('windows');
        const isMac = userAgent.includes('mac');
        const isLinux = userAgent.includes('linux');

        let desktopCommand = '';
        let instructions = '';

        if (isWindows) {
          desktopCommand = 'explorer.exe shell:Desktop';
          instructions = 'You can open your Desktop by pressing Windows key + D, or by clicking the Desktop icon on your taskbar.';
        } else if (isMac) {
          desktopCommand = 'open ~/Desktop';
          instructions = 'You can open your Desktop by pressing Cmd + F3 (Mission Control), or by clicking the Desktop in your Dock.';
        } else if (isLinux) {
          desktopCommand = 'xdg-open ~/Desktop';
          instructions = 'You can open your Desktop using your file manager or by pressing Ctrl + Alt + D.';
        } else {
          instructions = 'You can open your Desktop using your operating system\'s standard method (usually a keyboard shortcut or clicking a desktop icon).';
        }

        // Try to use a more compatible approach - create a temporary link
        const link = document.createElement('a');
        link.style.display = 'none';

        // For Windows, try using the shell: protocol
        if (isWindows) {
          link.href = 'shell:Desktop';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          speak("Attempting to open your Desktop folder. If it doesn't open automatically, " + instructions);
        } else {
          // For other systems, provide instructions
          speak("I can't directly open your Desktop from the browser due to security restrictions. " + instructions);
        }

        console.log("Desktop open attempted with command:", desktopCommand);

      } catch (error) {
        console.error("Error opening Desktop:", error);
        speak("Sorry, I encountered an error trying to open your Desktop. Please use your operating system's standard method to access the Desktop.");
      }
    }


  }



useEffect(() => {
  console.log("useEffect called");

  // Check if speech recognition is supported
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error("Speech recognition not supported in this browser");
    speak("Sorry, speech recognition is not supported in your browser. Please try using Chrome, Edge, or Safari.");
    return;
  }

  const recognition = new SpeechRecognition();

  recognition.continuous = true;
  recognition.lang = 'en-US';
  recognition.interimResults = false;

  recognitionRef.current = recognition;

  // Function to request microphone permission and start recognition
  const requestMicrophonePermission = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone permission granted");

      // Start recognition after a shorter delay for better responsiveness
      const startTimeout = setTimeout(() => {
        if (isMountedRef.current && !isSpeakingRef.current && !isRecognizingRef.current) {
          try {
            recognition.start();
            console.log("Recognition requested to start");
          } catch (e) {
            if (e.name !== "InvalidStateError") {
              console.error("Recognition start error:", e);
              speak("Sorry, I couldn't start voice recognition. Please check your microphone permissions and try again.");
            }
          }
        }
      }, 500); // Reduced from 1000ms to 500ms for faster startup

      return startTimeout;
    } catch (error) {
      console.error("Microphone permission denied:", error);
      speak("Please allow microphone access to use voice commands. Click 'Allow' when prompted and refresh the page.");
      return null;
    }
  };

  // Request permission and start recognition
  const startTimeout = requestMicrophonePermission();

  recognition.onstart = () => {
    if (!isMountedRef.current) return;
    console.log("Recognition started");
    isRecognizingRef.current = true;
    setIsListening(true);
  };

  recognition.onend = () => {
    if (!isMountedRef.current) return;
    console.log("Recognition ended");
    isRecognizingRef.current = false;
    setIsListening(false);

    // Only restart if not manually stopped and not currently speaking
    if (isMountedRef.current && !isSpeakingRef.current && !isManualStop) {
      // Clear any existing restart timeout to prevent multiple restarts
      if (window.recognitionRestartTimeout) {
        clearTimeout(window.recognitionRestartTimeout);
      }

      window.recognitionRestartTimeout = setTimeout(() => {
        if (isMountedRef.current && !isManualStop && !isSpeakingRef.current) {
          try {
            recognition.start();
            console.log("Recognition restarted");
          } catch (e) {
            if (e.name !== "InvalidStateError") console.error(e);
          }
        }
      }, 500); // Reduced from 1000ms to 500ms for faster restart
    } else {
      console.log("Recognition not restarted - manual stop:", isManualStop, "speaking:", isSpeakingRef.current);
    }
  };

  recognition.onerror = (event) => {
    if (!isMountedRef.current) return;
    console.warn("Recognition error:", event.error);
    isRecognizingRef.current = false;
    setIsListening(false);
    if (event.error !== "aborted" && isMountedRef.current && !isSpeakingRef.current) {
      setTimeout(() => {
        if (isMountedRef.current) {
          try {
            recognition.start();
            console.log("Recognition restarted after error");
          } catch (e) {
            if (e.name !== "InvalidStateError") console.error(e);
          }
        }
      }, 500); // Reduced from 1000ms to 500ms for faster recovery
    }
  };

  recognition.onresult = async (e) => {
    if (!isMountedRef.current) return;
    const transcript = e.results[e.results.length - 1][0].transcript.trim();
    console.log("Transcript received:", transcript);

    // Handle quick responses for common questions
    const lowerTranscript = transcript.toLowerCase();
    if (lowerTranscript.includes("what is your name") || lowerTranscript.includes("who are you")) {
      const responseText = `I'm ${userData.assistantName}, your virtual assistant.`;
      setAiText(responseText);
      setUserText(transcript);
      recognition.stop();
      isRecognizingRef.current = false;
      setIsListening(false);
      speak(responseText);
      setUserText("");
      return;
    }

    if (lowerTranscript.includes("what time is it") || lowerTranscript.includes("current time")) {
      const now = new Date();
      const timeText = `The current time is ${now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      setAiText(timeText);
      setUserText(transcript);
      recognition.stop();
      isRecognizingRef.current = false;
      setIsListening(false);
      speak(timeText);
      setUserText("");
      return;
    }

    if (lowerTranscript.includes("what date is it") || lowerTranscript.includes("current date")) {
      const now = new Date();
      const dateText = `Today is ${now.toLocaleDateString([], {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'})}`;
      setAiText(dateText);
      setUserText(transcript);
      recognition.stop();
      isRecognizingRef.current = false;
      setIsListening(false);
      speak(dateText);
      setUserText("");
      return;
    }

    // Clean transcript for better matching
    const cleanTranscript = transcript.toLowerCase().replace(/[.,!?]/g, '').trim();

    // More flexible assistant name matching to handle mispronunciations
    const assistantName = userData.assistantName.toLowerCase().replace(/[.,!?]/g, '').trim();
    const containsAssistantName = cleanTranscript.includes(assistantName) ||
                                  // Allow for common mispronunciations (remove/add 'h', 's' variations)
                                  cleanTranscript.includes(assistantName.replace('s', '')) ||
                                  cleanTranscript.includes(assistantName + 'h') ||
                                  cleanTranscript.includes(assistantName.replace('h', '')) ||
                                  // Simple fuzzy match - check if most characters match
                                  similarity(cleanTranscript, assistantName) > 0.8;

    // Check for common direct commands that should work without assistant name
    const directCommands = [
      'open youtube', 'play youtube', 'search youtube',
      'open google', 'search google',
      'open instagram', 'open facebook',
      'open calculator', 'calculator',
      'weather', 'show weather',
      'what time is it', 'current time',
      'what date is it', 'current date',
      'what is your name', 'who are you'
    ];

    const isDirectCommand = directCommands.some(cmd => cleanTranscript.includes(cmd));

    // Process command if it contains assistant name OR is a direct command
    if (containsAssistantName || isDirectCommand) {
      console.log(containsAssistantName ? "Assistant name found in transcript" : "Direct command detected");
      setAiText("");
      setUserText(transcript);
      recognition.stop();
      isRecognizingRef.current = false;
      setIsListening(false);
      // Show immediate feedback to user
      setAiText("Thinking...");

      // Strip assistant name from transcript before sending to AI
      let processedTranscript = transcript;
      if (containsAssistantName) {
        const assistantNameRegex = new RegExp(userData.assistantName, 'i');
        processedTranscript = transcript.replace(assistantNameRegex, '').trim();
      }

      const data = await getAssistantResponse(processedTranscript);
      console.log("Assistant response received:", data);
      // Clear thinking text before speaking
      setAiText("");
      if (data) {
        handleCommand(data);
        setAiText(data.response);
      } else {
        speak("Sorry, I encountered an error processing your request.");
        setAiText("Sorry, I encountered an error processing your request.");
      }
      setUserText("");
    } else {
      console.log("Neither assistant name nor recognized direct command found in transcript");
    }
  };


    // Make the greeting more responsive and interactive
    setTimeout(() => {
      const greeting = new SpeechSynthesisUtterance(`Hello ${userData.name}, what can I help you with?`);
      greeting.lang = 'hi-IN';

      window.speechSynthesis.speak(greeting);
      console.log("Greeting spoken");
    }, 500); // Small delay to ensure everything is loaded

  return () => {
    console.log("useEffect cleanup");
    isMountedRef.current = false;
    if (startTimeout) {
      clearTimeout(startTimeout);
    }
    try {
      recognition.stop();
    } catch (e) {
      console.error("Error stopping recognition:", e);
    }
    setIsListening(false);
    isRecognizingRef.current = false;

    // Cancel any ongoing speech synthesis
    try {
      synth.cancel();
    } catch (e) {
      console.error("Error canceling speech synthesis:", e);
    }
  };
}, []);

  const [mode, setMode] = useState("dashboard"); // "chatbot", "voice", or "dashboard"
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showWelcome, setShowWelcome] = useState(true);

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    // Hide welcome after 5 seconds
    const welcomeTimer = setTimeout(() => {
      setShowWelcome(false);
    }, 5000);

    return () => {
      clearInterval(timer);
      clearTimeout(welcomeTimer);
    };
  }, []);

  const handleFloatingAction = (actionType) => {
    console.log("Floating action triggered:", actionType);

    // Define popup configurations for floating actions
    const floatingActionConfigs = {
      'calculator': {
        url: 'https://www.google.com/search?q=calculator',
        fallbackMessage: "I'm trying to open calculator for you, but your browser is blocking popups. Please allow popups for this site."
      },
      'weather': {
        url: 'https://www.google.com/search?q=weather',
        fallbackMessage: "I'm trying to show weather information for you, but your browser is blocking popups. Please allow popups for this site."
      },
      'wikipedia': {
        url: 'https://www.wikipedia.org/',
        fallbackMessage: "I'm trying to open Wikipedia for you, but your browser is blocking popups. Please allow popups for this site."
      }
    };

    // Handle popup-based floating actions
    if (floatingActionConfigs[actionType]) {
      const config = floatingActionConfigs[actionType];
      openPopup(config.url, config.fallbackMessage, speak);
      return;
    }

    // Handle non-popup actions
    switch (actionType) {
      case 'jokes':
        speak("Here's a joke for you: Why don't scientists trust atoms? Because they make up everything!");
        break;
      case 'notes':
        speak("Opening notes application...");
        break;
      default:
        break;
    }
  };

  const navigateLesson = (direction) => {
    if (!currentTeacher || !currentLesson) return;

    const teacherKey = currentTeacher.title.toLowerCase().includes('english') ? 'english-teacher' : 'fullstack-teacher';
    const lessons = teacherLessons[teacherKey];
    const currentIndex = lessons.findIndex(lesson => lesson.id === currentLesson.id);

    if (direction === 'next' && currentIndex < lessons.length - 1) {
      const nextLesson = lessons[currentIndex + 1];
      setCurrentLesson(nextLesson);
      speak(`Moving to the next lesson: ${nextLesson.title}`);
    } else if (direction === 'prev' && currentIndex > 0) {
      const prevLesson = lessons[currentIndex - 1];
      setCurrentLesson(prevLesson);
      speak(`Going back to: ${prevLesson.title}`);
    } else if (direction === 'next' && currentIndex === lessons.length - 1) {
      speak("You've reached the last lesson! Great job completing all the lessons.");
    } else if (direction === 'prev' && currentIndex === 0) {
      speak("This is the first lesson. There's no previous lesson to go back to.");
    }
  };

  const handleAskSubmit = async () => {
    if (!selectedTeacher || !askQuestion.trim()) {
      speak("Please select a teacher and enter your question.");
      return;
    }

    try {
      // Send question to backend AI assistant
      const data = await getAssistantResponse(`Teacher: ${selectedTeacher}, Question: ${askQuestion}`);

      if (data && data.response) {
        setTeacherAnswer(data.response);
        speak(`Here's the answer from your ${selectedTeacher}: ${data.response}`);
      } else {
        setTeacherAnswer("Sorry, I encountered an error processing your question.");
        speak("Sorry, I encountered an error processing your question.");
      }
    } catch (error) {
      console.error("Error submitting question:", error);
      setTeacherAnswer("Sorry, there was an error processing your question.");
      speak("Sorry, there was an error processing your question.");
    }
  };

  // Enhanced background with dynamic gradients
  const [bgGradient, setBgGradient] = useState("from-black via-purple-900/20 to-black");

  // Teacher-related state variables
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [currentTeacher, setCurrentTeacher] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [teacherProgress, setTeacherProgress] = useState([]);
  const [showAskModal, setShowAskModal] = useState(false);
  const [askQuestion, setAskQuestion] = useState('');
  const [teacherAnswer, setTeacherAnswer] = useState('');
  const [selectedTeacher, setSelectedTeacher] = useState('');

  // Weather modal state
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);

  useEffect(() => {
    const gradients = [
      "from-black via-purple-900/20 to-black",
      "from-black via-blue-900/20 to-black",
      "from-black via-pink-900/20 to-black",
      "from-black via-indigo-900/20 to-black"
    ];

    const interval = setInterval(() => {
      setBgGradient(gradients[Math.floor(Math.random() * gradients.length)]);
    }, 10000); // Change every 10 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className={`w-full h-[100vh] bg-gradient-to-br ${bgGradient} flex justify-center items-center flex-col gap-[15px] fixed inset-0 overflow-hidden transition-all duration-[3000ms] ease-in-out`}>
      {/* Animated Welcome Section */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.8 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute top-10 left-1/2 transform -translate-x-1/2 z-30"
          >
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 backdrop-blur-lg border border-purple-400/30 rounded-2xl p-6 shadow-2xl shadow-purple-500/20">
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.6 }}
                className="text-4xl font-bold text-white text-center mb-2"
              >
                Welcome back, {userData?.name}! 👋
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.6 }}
                className="text-gray-300 text-center text-lg"
              >
                {currentTime.toLocaleDateString([], {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9, duration: 0.6 }}
                className="text-gray-400 text-center text-sm"
              >
                {currentTime.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Particle Background */}
      <ParticleBackground />

      {/* Floating Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Floating circles */}
        <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-purple-500/20 rounded-full animate-pulse"></div>
        <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-pink-500/20 rounded-full animate-pulse animation-delay-1000"></div>
        <div className="absolute bottom-1/4 left-1/3 w-2 h-2 bg-blue-500/20 rounded-full animate-pulse animation-delay-2000"></div>
        <div className="absolute bottom-1/3 right-1/3 w-4 h-4 bg-indigo-500/20 rounded-full animate-pulse animation-delay-3000"></div>

        {/* Floating squares */}
        <div className="absolute top-1/2 left-1/5 w-1 h-1 bg-purple-400/30 rotate-45 animate-pulse animation-delay-500"></div>
        <div className="absolute top-2/3 right-1/5 w-1 h-1 bg-pink-400/30 rotate-45 animate-pulse animation-delay-1500"></div>
        <div className="absolute bottom-1/2 left-2/3 w-1 h-1 bg-blue-400/30 rotate-45 animate-pulse animation-delay-2500"></div>
      </div>
      {/* Hamburger Menu Button - Only visible when menu is closed */}
      {!ham && (
        <button
          className='lg:hidden text-white absolute top-[20px] right-[20px] w-[25px] h-[25px] z-50 hover:text-gray-300 transition-colors'
          onClick={() => {
            console.log("Hamburger menu clicked");
            setHam(true);
          }}
          type="button"
        >
          <CgMenuRight className="w-full h-full" />
        </button>
      )}

      {/* Hamburger Menu - Slides in from right when opened */}
      <div className={`absolute lg:hidden top-0 w-full h-full bg-[#00000053] backdrop-blur-lg p-[20px] flex flex-col gap-[20px] items-start z-40 ${ham?"translate-x-0":"translate-x-full"} transition-transform duration-300`}>
        {/* Close Button - Only visible when menu is open */}
        <button
          className='text-white absolute top-[20px] right-[20px] w-[25px] h-[25px] z-50 hover:text-gray-300 transition-colors flex items-center justify-center'
          onClick={() => {
            console.log("Close button clicked");
            setHam(false);
          }}
          type="button"
        >
          <span className="text-2xl font-bold">×</span>
        </button>
       <button className='min-w-[150px] h-[60px]  text-white font-semibold   bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 rounded-full cursor-pointer text-[19px] shadow-lg shadow-pink-500/30 transition-all duration-300' onClick={handleLogOut}>Log Out</button>
      <button className='min-w-[150px] h-[60px]  text-white font-semibold  bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700  rounded-full cursor-pointer text-[19px] px-[20px] py-[10px] shadow-lg shadow-purple-500/30 transition-all duration-300' onClick={()=>navigate("/customize")}>Customize your Assistant</button>

      <div className='w-full h-[2px] bg-gray-400'></div>
      <h1 className='text-white font-semibold text-[19px]'>History</h1>

      <div className='w-full h-[400px] gap-[20px] overflow-y-auto flex flex-col truncate'>
        {userData.history?.map((his, index)=>(
          <div key={`history-${index}`} className='text-gray-200 text-[18px] w-full h-[30px]  '>{his}</div>
        ))}
      </div>
    </div>

    <button className='min-w-[150px] h-[60px] mt-[30px] text-white font-semibold absolute hidden lg:block top-[20px] right-[20px]  bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 rounded-full cursor-pointer text-[19px] shadow-lg shadow-pink-500/30 transition-all duration-300' onClick={handleLogOut}>Log Out</button>
    <button className='min-w-[150px] h-[60px] mt-[30px] text-white font-semibold  bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 absolute top-[100px] right-[20px] rounded-full cursor-pointer text-[19px] px-[20px] py-[10px] hidden lg:block shadow-lg shadow-purple-500/30 transition-all duration-300' onClick={()=>navigate("/customize")}>Customize your Assistant</button>


      {/* Mode Toggle */}
      <div className="mb-8">
        <ModernToggle mode={mode} setMode={setMode} />
      </div>

      {mode === "chatbot" ? (
        <div className="w-[400px] h-[500px] p-4 flex flex-col bg-gray-900/50 backdrop-blur-sm rounded-lg border border-gray-700">
          <div className="flex-1 overflow-y-auto mb-4 scrollbar-hide" id="chat-window" style={{color: "white"}}>
            {/* Chat messages will be rendered here */}
            {chatMessages.length === 0 && <p className="text-gray-400">Start chatting with {userData?.assistantName}...</p>}
            {chatMessages.map((msg, index) => (
              <motion.div
                key={index}
                className={`mb-2 ${msg.sender === "user" ? "text-right" : "text-left"}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <span className={`inline-block px-3 py-1 rounded ${msg.sender === "user" ? "bg-blue-600" : "bg-gray-700"}`}>
                  {msg.text}
                </span>
              </motion.div>
            ))}
          </div>
          <form onSubmit={handleChatSubmit} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 px-3 py-2 rounded bg-gray-800 text-white focus:outline-none"
            />
            <ModernButton type="submit" variant="primary" size="small">Send</ModernButton>
          </form>
        </div>
      ) : mode === "voice" ? (
        <div className="w-[600px] h-[600px] p-6 flex flex-col items-center justify-center gap-6 bg-black/90 backdrop-blur-sm rounded-lg border-2 border-green-400/50 shadow-lg shadow-green-400/20">
          <div className='w-[700px] h-[700px] flex justify-center items-center overflow-hidden rounded-4xl'>
            <img src={userData?.assistantImage} alt="" className='h-full object-cover rounded-4xl'/>
          </div>
          <h1 className='text-white text-[18px] font-semibold'>I'm {userData?.assistantName}</h1>

          <div className="flex flex-col items-center gap-4 backdrop-blur-sm rounded-lg p-4">
            {!aiText && <img src={userImg} alt="" className='w-[200px]'/>}
            {aiText && <img src={aiImg} alt="" className='w-[200px]'/>}

            <h1 className='text-white text-[18px] font-semibold text-wrap text-center min-h-[50px]'>
              {userText ? userText : aiText ? aiText : null}
            </h1>
          </div>

          {/* Voice Control Buttons */}
          <div className="flex gap-4 mt-4">
            <ModernButton
              onClick={handleStop}
              variant="danger"
              size="medium"
              disabled={!isSpeaking && !isListening}
            >
              Stop
            </ModernButton>
            <ModernButton
              onClick={handleContinue}
              variant="success"
              size="medium"
              disabled={isSpeaking || isListening}
            >
              Continue
            </ModernButton>
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-8">
          {/* Full-screen Dashboard Mode */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-7xl h-full flex flex-col"
          >
            {/* Dashboard Header */}
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-white mb-2">
                Smart Widget Dashboard
              </h1>
              <p className="text-gray-300 text-lg">
                Welcome to your intelligent command center, {userData?.name}
              </p>
            </div>

            {/* Main Dashboard Content */}
            <div className="flex-1 flex items-center justify-center">
              <SmartWidgetDashboard onCommand={handleCommand} mode={mode} showDashboardButton={true} />
            </div>

            {/* Dashboard Footer */}
            <div className="text-center mt-8">
              <p className="text-gray-400 text-sm">
                Use the widgets above to quickly access your favorite tools and commands
              </p>
            </div>
          </motion.div>
        </div>
      )}

      {/* Teacher Lesson Modal */}
      <AnimatePresence>
        {showLessonModal && currentLesson && currentTeacher && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-gray-900/95 backdrop-blur-lg border border-purple-400/30 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">{currentTeacher.title}</h2>
                  <h3 className="text-xl text-purple-300 mb-2">{currentLesson.title}</h3>
                  <p className="text-gray-300">{currentLesson.description}</p>
                </div>
                <button
                  onClick={() => setShowLessonModal(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-800/50 rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-white mb-2">Lesson Content</h4>
                  <div className="text-gray-300 whitespace-pre-wrap">{currentLesson.content}</div>
                </div>

                {currentLesson.exercises && (
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-2">Practice Exercises</h4>
                    <div className="text-gray-300">{currentLesson.exercises}</div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6 justify-between">
                <div className="flex gap-2">
                  <ModernButton
                    onClick={() => navigateLesson('prev')}
                    variant="secondary"
                    size="medium"
                    disabled={currentLesson.id === 1}
                  >
                    Previous
                  </ModernButton>
                  <ModernButton
                    onClick={() => navigateLesson('next')}
                    variant="secondary"
                    size="medium"
                    disabled={currentLesson.id === teacherLessons[currentTeacher.title.toLowerCase().includes('english') ? 'english-teacher' : 'fullstack-teacher'].length}
                  >
                    Next
                  </ModernButton>
                </div>
                <div className="flex gap-2">
                  <ModernButton
                    onClick={() => setShowLessonModal(false)}
                    variant="secondary"
                    size="medium"
                  >
                    Close Lesson
                  </ModernButton>
                  <ModernButton
                    onClick={() => {
                      setShowLessonModal(false);
                      speak("Great! You've completed this lesson. Would you like to continue with the next lesson or ask me any questions about what you learned?");
                    }}
                    variant="primary"
                    size="medium"
                  >
                    Complete Lesson
                  </ModernButton>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Teacher Progress Modal */}
      <AnimatePresence>
        {showProgressModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-gray-900/95 backdrop-blur-lg border border-purple-400/30 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-white">Your Learning Progress</h2>
                <button
                  onClick={() => setShowProgressModal(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                {teacherProgress.length === 0 ? (
                  <p className="text-gray-300 text-center py-8">No progress data available yet. Start your first lesson to track your progress!</p>
                ) : (
                  teacherProgress.map((progress, index) => (
                    <div key={index} className="bg-gray-800/50 rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="text-lg font-semibold text-white">{progress.teacherName}</h3>
                        <span className="text-purple-300">{progress.completedLessons}/{progress.totalLessons} lessons</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(progress.completedLessons / progress.totalLessons) * 100}%` }}
                        ></div>
                      </div>
                      <p className="text-gray-300 text-sm mt-2">Last activity: {new Date(progress.lastActivity).toLocaleDateString()}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <ModernButton
                  onClick={() => setShowProgressModal(false)}
                  variant="secondary"
                  size="medium"
                >
                  Close
                </ModernButton>
                <ModernButton
                  onClick={() => {
                    setShowProgressModal(false);
                    speak("Would you like to continue learning or start a new lesson?");
                  }}
                  variant="primary"
                  size="medium"
                >
                  Continue Learning
                </ModernButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weather Modal */}
      <WeatherModal
        isOpen={showWeatherModal}
        onClose={() => setShowWeatherModal(false)}
        weatherData={weatherData}
        loading={weatherLoading}
        error={weatherError}
      />

      {/* Teacher Ask Modal */}
      <AnimatePresence>
        {showAskModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-gray-900/95 backdrop-blur-lg border border-purple-400/30 rounded-2xl p-6 max-w-2xl w-full"
            >
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold text-white">Ask Your Teacher</h2>
                <button
                  onClick={() => {
                    setShowAskModal(false);
                    setAskQuestion('');
                    setTeacherAnswer('');
                    setSelectedTeacher('');
                  }}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-white font-semibold mb-2">Select Teacher</label>
                  <select
                    value={selectedTeacher}
                    onChange={(e) => setSelectedTeacher(e.target.value)}
                    className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-purple-400 focus:outline-none"
                  >
                    <option value="">Choose a teacher...</option>
                    <option value="english-teacher">English Teacher</option>
                    <option value="fullstack-teacher">Full Stack Development Teacher</option>
                  </select>
                </div>

                <div>
                  <label className="block text-white font-semibold mb-2">Your Question</label>
                  <textarea
                    value={askQuestion}
                    onChange={(e) => setAskQuestion(e.target.value)}
                    placeholder="Type your question here..."
                    className="w-full p-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-purple-400 focus:outline-none h-32 resize-none"
                  />
                </div>

                {teacherAnswer && (
                  <div className="bg-gray-800/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-2">Teacher's Answer</h4>
                    <div className="text-gray-300 whitespace-pre-wrap">{teacherAnswer}</div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <ModernButton
                  onClick={() => {
                    setShowAskModal(false);
                    setAskQuestion('');
                    setTeacherAnswer('');
                    setSelectedTeacher('');
                  }}
                  variant="secondary"
                  size="medium"
                >
                  Close
                </ModernButton>
                <ModernButton
                  onClick={handleAskSubmit}
                  variant="primary"
                  size="medium"
                  disabled={!selectedTeacher || !askQuestion.trim()}
                >
                  Ask Question
                </ModernButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


export default Home;
