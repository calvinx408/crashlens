import { Event } from './types';

export interface KnownEvent {
  title: string;
  meaning: string;
  crashRelated?: boolean;
}

// Common Windows event IDs, described in plain language.
// Keyed by `${source}:${id}` where the source is optional (use '*' for any source).
const KNOWN: Record<string, KnownEvent> = {
  'Microsoft-Windows-Kernel-Power:41': {
    title: 'Unexpected shutdown (power loss or crash)',
    meaning: 'Windows restarted or powered off without shutting down cleanly. Common causes: a crash (blue screen), a power problem, or a hard reset.',
    crashRelated: true,
  },
  'EventLog:6008': {
    title: 'Previous shutdown was unexpected',
    meaning: 'The PC was turned off or restarted without a clean shutdown. Usually follows a crash or power loss.',
    crashRelated: true,
  },
  'Microsoft-Windows-WER-SystemErrorReporting:1001': {
    title: 'Blue screen (bugcheck) recorded',
    meaning: 'Windows crashed with a stop code. The stop code in the message is the key clue (for example IRQL_NOT_LESS_OR_EQUAL or DRIVER_IRQL_NOT_LESS_OR_EQUAL).',
    crashRelated: true,
  },
  'BugCheck:1001': {
    title: 'Blue screen (bugcheck) recorded',
    meaning: 'Windows crashed with a stop code. The stop code in the message is the key clue.',
    crashRelated: true,
  },
  '*:1000': {
    title: 'Application crashed',
    meaning: 'A program stopped working unexpectedly. The faulting module name in the message shows which file caused it.',
    crashRelated: true,
  },
  '*:1002': {
    title: 'Application stopped responding (hang)',
    meaning: 'A program stopped responding to Windows for a long time.',
  },
  'Service Control Manager:7034': {
    title: 'A service stopped unexpectedly',
    meaning: 'A background Windows service crashed and was not restarted automatically.',
  },
  'Service Control Manager:7031': {
    title: 'A service crashed and will restart',
    meaning: 'A background Windows service crashed. Windows will try to restart it.',
  },
  'Disk:7': {
    title: 'Disk error (bad block)',
    meaning: 'The drive reported a bad block. Can indicate a failing disk. Back up important data.',
  },
  'Ntfs:55': {
    title: 'File system corruption',
    meaning: 'The NTFS file system found damaged data on a drive. Running chkdsk may be needed.',
  },
  'Microsoft-Windows-Kernel-Processor-Power:55': {
    title: 'Processor power problem',
    meaning: 'The processor reported a power or firmware issue. Check BIOS/UEFI and power settings.',
  },
  'Microsoft-Windows-WHEA-Logger:17': {
    title: 'Hardware error corrected',
    meaning: 'The hardware reported a correctable error (CPU, memory, or PCIe). Repeated errors suggest failing hardware.',
  },
  'Microsoft-Windows-WHEA-Logger:18': {
    title: 'Hardware error (fatal)',
    meaning: 'The hardware reported an error Windows could not correct. Often causes a crash. Check memory, CPU temperatures, and drivers.',
    crashRelated: true,
  },
  'Security:4625': {
    title: 'Failed sign-in attempt',
    meaning: 'Someone (or something) tried to sign in with the wrong password or an unknown account.',
  },
  'Security:4624': {
    title: 'Successful sign-in',
    meaning: 'An account signed in successfully.',
  },
};

function lookup(event: Event): KnownEvent | undefined {
  return KNOWN[`${event.source}:${event.eventID}`] || KNOWN[`*:${event.eventID}`];
}

export function describeEvent(event: Event): { title: string; meaning?: string } {
  const known = lookup(event);
  if (known) return { title: known.title, meaning: known.meaning };
  return { title: `${event.source} (Event ${event.eventID})` };
}

const CRASH_WORDS = /\b(crash|bugcheck|blue screen|stop code|unexpected shutdown|kernel-power|dump file|minidump|hang)\b/i;

export function isCrashRelated(event: Event): boolean {
  const known = lookup(event);
  if (known?.crashRelated) return true;
  if (event.level === 'Critical') return true;
  return CRASH_WORDS.test(event.message);
}

export function relativeTime(date: Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}
