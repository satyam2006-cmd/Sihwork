import fs from 'fs';

const html = fs.readFileSync('scratch/chatgpt_response_body.html', 'utf8');

console.log('HTML Length:', html.length);

// Find all elements with classes
const classRegex = /class="([^"]+)"/g;
const classes = new Set();
let match;
while ((match = classRegex.exec(html)) !== null) {
  classes.add(match[1]);
}

console.log('Found classes:', Array.from(classes).slice(0, 100));

// Find all buttons
const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
const buttons = [];
while ((match = buttonRegex.exec(html)) !== null) {
  buttons.push(match[0].replace(/<[^>]+>/g, '').trim());
}
console.log('Found buttons text:', buttons);

// Find all forms
const formRegex = /<form[^>]*>/gi;
const forms = [];
while ((match = formRegex.exec(html)) !== null) {
  forms.push(match[0]);
}
console.log('Found forms:', forms);
