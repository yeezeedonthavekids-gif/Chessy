import { useState } from 'react';
import type { Lesson } from '../lib/coach/lessons';
import { addMemory, uid } from '../lib/storage/db';
import { Board } from './Board';
import { SourceLabel } from './CoachBlocks';
import { IconAlert, IconCheck } from './Icons';

/** Step-through lesson ending in a short multiple-choice quiz. */
export function LessonView({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(lesson.quiz.map(() => null));
  const inQuiz = i >= lesson.steps.length;
  const q = inQuiz ? lesson.quiz[i - lesson.steps.length] : null;
  const qi = i - lesson.steps.length;
  const finished = inQuiz && qi >= lesson.quiz.length;
  const step = !inQuiz ? lesson.steps[i] : null;

  const finish = () => {
    const correct = answers.filter((a, k) => a === lesson.quiz[k].answer).length;
    void addMemory({ id: uid('mem'), kind: 'lesson-completed', text: `Completed lesson “${lesson.title}” (quiz ${correct}/${lesson.quiz.length})`, at: Date.now() }).catch(() => undefined);
    onClose();
  };

  return (
    <div className="stack">
      <div className="row spread">
        <h2>{lesson.title}</h2>
        <span className="small faint">
          {finished ? 'Done' : inQuiz ? `Question ${qi + 1}/${lesson.quiz.length}` : `Step ${i + 1}/${lesson.steps.length}`}
        </span>
      </div>
      <SourceLabel source="coach" />
      {step && (
        <>
          <p>{step.text}</p>
          {step.fen && (
            <div style={{ maxWidth: 360 }}>
              <Board fen={step.fen} id={`lesson-${lesson.id}-${i}`} />
            </div>
          )}
        </>
      )}
      {q && (
        <>
          <p style={{ fontWeight: 600 }}>{q.prompt}</p>
          <div className="stack" style={{ gap: 6 }}>
            {q.options.map((opt, k) => {
              const chosen = answers[qi];
              const isAnswer = k === q.answer;
              const style =
                chosen === null
                  ? undefined
                  : isAnswer
                    ? { borderColor: 'var(--green)', color: 'var(--green)' }
                    : chosen === k
                      ? { borderColor: 'var(--red)', color: 'var(--red)' }
                      : undefined;
              return (
                <button
                  key={k}
                  className="btn"
                  style={{ justifyContent: 'flex-start', ...style }}
                  disabled={chosen !== null}
                  onClick={() => setAnswers((a) => a.map((v, j) => (j === qi ? k : v)))}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {answers[qi] !== null && (
            <div className={`notice ${answers[qi] === q.answer ? 'ok' : 'error'}`}>
              {answers[qi] === q.answer ? <IconCheck /> : <IconAlert />}
              <span>{q.explanation}</span>
            </div>
          )}
        </>
      )}
      {finished && <p>Lesson complete — {answers.filter((a, k) => a === lesson.quiz[k].answer).length}/{lesson.quiz.length} correct.</p>}
      <div className="row">
        {i > 0 && !finished && (
          <button className="btn ghost" onClick={() => setI(i - 1)}>
            Back
          </button>
        )}
        {finished ? (
          <button className="btn primary" onClick={finish}>
            Finish lesson
          </button>
        ) : (
          <button className="btn primary" disabled={!!q && answers[qi] === null} onClick={() => setI(i + 1)}>
            {i === lesson.steps.length - 1 ? 'Quiz me' : 'Next'}
          </button>
        )}
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
