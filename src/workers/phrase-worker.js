import { parentPort } from 'worker_threads';

parentPort.on('message', ({ text, commonWords }) => {
  // Convert commonWords array back to a Set
  const commonWordsSet = new Set(commonWords);
  
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(word => !commonWordsSet.has(word));

  const phrases = [];
  for (let i = 0; i < words.length - 2; i++) {
    phrases.push(words.slice(i, i + 3).join(' '));
  }
  
  parentPort.postMessage(phrases);
});
