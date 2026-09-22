const testCases = [
  "Add a task buy milk high",
  "add task review pull request normal",
  "Buy groceries low priority",
  "Take out trash high",
  "Add a task: fix bugs"
];

for (const t of testCases) {
  let parsedTask = t.trim();
  let parsedPriority = 'normal';

  const addPrefixMatch = parsedTask.match(/^(?:add\s+a?\s*task\s*:?\s*)(.*)/i);
  if (addPrefixMatch) {
    parsedTask = addPrefixMatch[1].trim();
  }

  const priorityMatch = parsedTask.match(/(.*?)\s+(high|normal|low)(?:\s+priority)?$/i);
  if (priorityMatch) {
    parsedTask = priorityMatch[1].trim();
    parsedPriority = priorityMatch[2].toLowerCase();
  }
  console.log(`Original: "${t}" -> Task: "${parsedTask}", Priority: "${parsedPriority}"`);
}
