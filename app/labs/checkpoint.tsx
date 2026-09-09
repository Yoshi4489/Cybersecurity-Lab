"use client";

import { useState } from "react";

export type Question = { question: string; choices: string[]; answer: number; explanation: string };

export function Checkpoint({ question, id, passed, onPass }: {
  question: Question; id: string; passed: boolean; onPass: () => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [attempt, setAttempt] = useState<number | null>(null);
  const correct = attempt === question.answer;
  return <form className="workspace-checkpoint" onSubmit={(event) => {
    event.preventDefault();
    if (choice === null) return;
    setAttempt(choice);
    if (choice === question.answer) onPass();
  }}>
    <fieldset><legend>Check your understanding: {question.question}</legend>
      {question.choices.map((text, index) => <label key={text}><input type="radio" name={id} value={index} checked={choice === index} onChange={() => { setChoice(index); setAttempt(null); }} />{text}</label>)}
    </fieldset>
    <button type="submit" disabled={choice === null}>Check answer</button>
    <p role="status" aria-live="polite">{attempt !== null ? `${correct ? "Correct." : "Not quite — try again."} ${question.explanation}` : passed ? "Understanding check saved. You can try it again." : "Choose an explanation, then check it before submitting the flag."}</p>
  </form>;
}
