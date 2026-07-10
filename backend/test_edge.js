import comprehensiveAssistantResponse from './comprehensiveAssistant.js';

async function testEdgeCommand() {
  const command = 'microsoft edge sound on';
  const assistantName = 'Jarvis';
  const userName = 'TestUser';
  const userId = 'test123';

  try {
    const response = await comprehensiveAssistantResponse(command, assistantName, userName, userId);
    console.log('Response:', response);
  } catch (error) {
    console.error('Error:', error);
  }
}

testEdgeCommand();
