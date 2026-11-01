const ALLOWED_TYPES = [
  'feat', 'fix', 'build', 'chore', 'docs',
  'refactor', 'test', 'style', 'perf', 'ci'
];

const PATTERN = /^(\w+)\(([^)]+)\):\s+(.+)$/;

function checkTitle(title) {
  const match = title.match(PATTERN);

  if (!match) {
    console.error(`PR title does not match required format: <type>(<scope>): <description>`);
    console.error(`  Got: "${title}"`);
    console.error(`  Example: "feat(canvas): add zoom controls"`);
    process.exit(1);
  }

  const [, type, scope, description] = match;

  if (!ALLOWED_TYPES.includes(type)) {
    console.error(`Invalid type "${type}". Allowed types: ${ALLOWED_TYPES.join(', ')}`);
    process.exit(1);
  }

  if (!scope.trim()) {
    console.error(`Scope cannot be empty. Example: feat(canvas): add zoom controls`);
    process.exit(1);
  }

  if (description.length < 5) {
    console.error(`Description too short (min 5 chars). Got: "${description}"`);
    process.exit(1);
  }

  if (description[0] !== description[0].toLowerCase()) {
    console.error(`Description must start lowercase. Got: "${description}"`);
    process.exit(1);
  }

  console.log(`PR title is valid: ${type}(${scope}): ${description}`);
}

// The title comes in on stdin, so it never passes through the shell, where backticks in it would run.
// A single argument still works for quick checks of plain titles.
function readInput() {
  const arg = process.argv[2];
  if (arg !== undefined && arg !== '-') return Promise.resolve(arg);
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  });
}

readInput().then((input) => {
  const title = input.trim();
  if (!title) {
    console.error("Usage: node pr-title-check.js <<'EOF'   (then the title, then EOF)");
    process.exit(1);
  }
  checkTitle(title);
});
