import * as mammoth from 'mammoth';
console.log('Mammoth exports:', Object.keys(mammoth));
try {
    console.log('convertToMarkdown type:', typeof mammoth.convertToMarkdown);
} catch (e) {
    console.log('Error accessing convertToMarkdown:', e.message);
}

import mammothDefault from 'mammoth';
console.log('Mammoth default export type:', typeof mammothDefault);
if (typeof mammothDefault === 'object' && mammothDefault !== null) {
    console.log('Mammoth default keys:', Object.keys(mammothDefault));
}
