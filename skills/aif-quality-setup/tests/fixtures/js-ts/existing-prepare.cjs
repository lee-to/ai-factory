// Deliberate lifecycle sentinel for runtime audit tests; never run during discovery.
require('node:fs').appendFileSync('prepare-executed.txt', 'existing prepare\n');
