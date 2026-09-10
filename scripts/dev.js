// Run the event hub and the overlay dev server together: `npm run dev`
import { spawn } from 'node:child_process';

const opts = { stdio: 'inherit', shell: true };
const procs = [
  spawn('node', ['server/index.js'], opts),
  spawn('npm', ['--prefix', 'overlay', 'run', 'dev'], opts),
];

const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => code && stop()));
