# Lab 00 — Your First Shift: Terminal Practice

**Level:** Complete beginner · **Mode:** Guided · **Time:** 15 minutes

## Scenario

Before your first network investigation, Northstar Shipping asks you to collect
a harmless desk handover. Your isolated toolbox has a folder called `/practice`.
It contains a welcome note and a four-line training log. Read the note, select
the READY log entry, and copy two practice flags into this portal. No scanning,
internet access, real credentials, or previous command-line knowledge is needed.

## What you need to know

A terminal is a place to type commands. A **prompt** such as `student@toolbox:~$`
means the shell is ready. Your prompt may look different. Do not type the prompt
or the `$`; type only the command, then press Enter. Output appears underneath.
When the prompt returns, that command has finished.

In `cat handover.txt`, `cat` is the command and `handover.txt` is an **argument**:
it tells the command which file to read. Spaces separate them. Commands and
filenames are case-sensitive. An option such as `ls -l` changes a command's
behavior; here `-l` asks for a detailed listing.

- `pwd` prints the current folder; it does not move you.
- `ls` lists names in that folder. `cd /practice` moves into a folder.
- `cat FILE` displays a file without editing it.
- `grep READY` keeps input lines containing the exact uppercase text READY.
- A pipe, `|`, sends the output on its left into the command on its right.
  `cat events.log | grep READY` does not change events.log.
- `printf '%s\n' 'hello trainee'` prints the quoted words as one argument.
  Try it now in the toolbox; expect one line: `hello trainee`.

To copy output, select just the text you need and use your terminal's Copy menu
or Ctrl+Shift+C (Cmd+C on macOS). Ctrl+C without Shift usually interrupts a
running command; it is not the copy shortcut in many terminals. Paste with the
portal field's Paste menu or Ctrl+V / Cmd+V. Do not include `practice_flag=`,
the prompt, or surrounding quotes in your flag submission.

## Start the lab

Open the portal at http://127.0.0.1:5173 and choose Lab 00. Click Start / resume,
then run the displayed shell command in your **host terminal** in the project folder.
If using the CLI instead, run:

```sh
node scripts/standalone-labctl.mjs start 00-terminal-basics
node scripts/standalone-labctl.mjs shell 00-terminal-basics
```

Everything below runs inside that Linux toolbox unless marked host terminal.
Your authorized scope is the supplied `/practice` folder, not files on your host.

## Objectives

### Flag 1 — Read your desk handover (`read-note`)

First run `pwd`, then `ls`. Notice your starting folder. Run `cd /practice`, then
run `pwd` and `ls` again. What changed? Read `handover.txt` using `cat` and copy
only its complete `RLAB{...}` value into the first flag field. Say which part of
`cat handover.txt` is the command and which part is the argument.

### Flag 2 — Filter and copy the practice evidence (`filter-log`)

Stay in `/practice`. Run `cat events.log` and count the four entries. Then run
`cat events.log | grep READY`. How many entries remain on screen? Copy the flag
from that one entry. Run `cat events.log` again: did filtering delete any lines?
Try `cat events.log | grep MISSING`; no output is expected because no line matches.

## Hints

### Flag 1 — read-note

<details>
<summary>Hint 1 — where to look</summary>

The evidence is in `/practice`, not your initial home folder.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Use `cd /practice`, then `ls` to see the file names.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Run `cat /practice/handover.txt`. Copy only the value beginning `RLAB{` and ending `}`.

</details>

### Flag 2 — filter-log

<details>
<summary>Hint 1 — where to look</summary>

The note names `events.log`. Only one entry says READY.

</details>

<details>
<summary>Hint 2 — what to try</summary>

Put `cat events.log` on the left of a pipe and `grep READY` on the right.

</details>

<details>
<summary>Hint 3 — concrete help</summary>

Run `cat /practice/events.log | grep READY`. The returned line contains your second flag.

</details>

## Solution

Try the task cards and hints first. These are real Linux commands in the isolated
toolbox; they do not need administrator privileges and do not edit your evidence.

### Read the note (`read-note`)

**Toolbox:**

```sh
pwd
ls
printf '%s\n' 'hello trainee'
cd /practice
pwd
ls
cat handover.txt
```

The second `pwd` prints `/practice`; `ls` lists `handover.txt` and `events.log`.
The note prints the case and your first practice flag. `cat` is the command,
`handover.txt` its filename argument. Select only `RLAB{...}` and paste it into
the first portal field. A flag is evidence, not a command to run.

**Host terminal — optional alternative to the portal field:**

```sh
node scripts/standalone-labctl.mjs verify 00-terminal-basics read-note 'RLAB{...}'
```

### Filter the log (`filter-log`)

**Toolbox:**

```sh
cd /practice
cat events.log
cat events.log | grep READY
cat events.log
```

You see four entries, then just the READY entry with the second flag, then all
four entries again. The pipe forwards text, and grep selects matching lines;
neither command edits the source file. Copy only the flag into the second field.
Running `cat events.log | grep MISSING` prints nothing and returns a nonzero
status because there is no match; that is not a broken terminal.

**Host terminal — optional alternative:**

```sh
node scripts/standalone-labctl.mjs verify 00-terminal-basics filter-log 'RLAB{...}'
```

## What this taught you

You navigated a folder, supplied a filename argument, read evidence, passed output
through a pipe, and copied only the requested value. The unchanged four-line log
is evidence that filtering output does not delete file contents. Next, Lab 01
uses this same prompt and copying workflow to inspect a fictional network.

## Stop or reset

**Host terminal — finish without clearing submissions:**

```sh
node scripts/standalone-labctl.mjs status 00-terminal-basics
node scripts/standalone-labctl.mjs stop 00-terminal-basics
```

On start/resume, flags and submitted progress stay the same. Supplied practice
files are recreated from the same run; any toolbox /tmp work is lost on stop.

**Optional clean retry — deletes this lab's progress and creates new flags:**

```sh
node scripts/standalone-labctl.mjs reset 00-terminal-basics
```
