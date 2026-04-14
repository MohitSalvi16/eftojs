import { compress, compareTokens } from "./dist/index.js";

const samples = [
  "In order to build a production-ready login system, please note that you really need to basically use secure password hashing. It is important to note that the system should be able to scale. Please note that you really need to make use of JWT tokens for authentication.",
  "I would like you to implement a function that is able to take an array of numbers and then return the maximum value. Please make sure that the implementation is efficient and that it handles edge cases. It is important to note that the function should work on an empty array as well.",
  "Could you please explain, in order to understand how recursion works, what the base case basically does and why it is important to have one? I would really appreciate it if you could provide a simple example that demonstrates this concept.",
  "Please note that I need you to create a REST API with authentication. It is important that the API has the ability to handle user registration and login. Please make use of JWT tokens for authorization. The database should basically be PostgreSQL and the application should be production-ready.",
  "In order to optimize the performance of this application, I would like you to analyze the database queries and identify any inefficiencies. Please note that the application is currently using PostgreSQL as the database. It is important to note that we need to maintain backward compatibility with the existing API.",
];

let totalBefore = 0;
let totalAfter = 0;
samples.forEach((s, i) => {
  const c = compress(s);
  const d = compareTokens(s, c);
  totalBefore += d.before;
  totalAfter += d.after;
  console.log(`\n[${i + 1}] ${d.before} → ${d.after} tokens (${d.savedPercent}% saved)`);
  console.log(`    ${c}`);
});

const totalSaved = totalBefore - totalAfter;
const pct = Math.round((totalSaved / totalBefore) * 1000) / 10;
console.log(`\n${"=".repeat(60)}`);
console.log(`AVERAGE: ${totalBefore} → ${totalAfter} tokens (${pct}% saved across ${samples.length} samples)`);
