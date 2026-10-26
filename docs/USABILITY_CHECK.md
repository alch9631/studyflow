# StudyFlow usability check

Run this with five classmates over one week using their own course material.
Record observed results; do not mark a test successful because a screen loaded.

1. Start with no courses. Ask the student to prepare and begin a useful task.
   Record time to the first task, whether they needed help, whether the chosen
   section was correct, and whether the available daily time was realistic.
2. Finish one small exercise. Confirm the task is complete, its parent topic
   stays open, and the student understands what remains to study.
3. Return after missing a planned day. Ask the student to adjust the plan.
   Record whether they understand the next three days, choose the recommendation,
   and can undo it. Confirm subsequent completed work cannot be overwritten.
4. Return at least 24 hours after a checked task. Ask a related recall question
   before opening the source. Record the answer and compare it with the supplied
   solution or the instructor's rubric. A self-rating alone is not correctness.
5. Use a phone and keyboard-only navigation for the first-task flow. Record
   missed controls, unclear labels, scrolling problems, and recovery from errors.

## Outcomes

Track unassisted starts, median time to first useful work, correct source
selection, return after a missed day, and the quality of the delayed answer.
Insights distinguishes self-checked task goals, tasks needing practice, and
self-checks repeated after at least 24 hours. It does not infer a grade or mastery
from time spent or task completion.

## iPhone checks

Check Safari and the installed home-screen app in portrait and landscape:

- Open the menu on a small screen. Reach language and appearance by scrolling,
  change a preference, then close the menu and scroll the page again.
- Scroll to the last course. Its controls must clear the add button and tabs.
- Upload a file with a long filename. Open its study setup and chapter preview;
  the filename, controls, and actions must stay inside the screen.
- In a study sheet, focus a text field with the keyboard open. Scroll to the
  final action, dismiss the keyboard, and rotate the phone. Keep pinch zoom usable.
- Swipe a course sideways to reveal its action, then scroll vertically across
  a course. Scroll a source excerpt and focus session without refreshing the page.
- Check date and time fields, German and English labels, both themes, and a
  larger system text size. Verify the notch and home indicator leave controls clear.
- With a slow connection, switch between Today, Calendar, Courses, and Insights.
  Once their background prefetch completes, switching should reuse the content
  without a network wait. On a cold visit, the selected tab immediately shows
  its pending indicator while the page loads.
  Complete a task or edit a calendar session, switch tabs, and confirm the change
  appears immediately. Leave the app idle for more than 30 seconds and check
  that the next visit fetches fresh content.

The automated experience suite (`npm run test:experience`) checks task/parent
separation, conservation of planned work, source matching and ownership,
explainable review priority, honest status, guarded undo, first-run capacity,
and repeated setup requests. Human observation is still needed for usefulness.
