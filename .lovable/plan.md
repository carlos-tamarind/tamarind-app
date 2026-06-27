## Plan

1. **Fix the conversation composer resize behavior**
   - Correct the resizable panel API usage from `orientation` to the library’s expected `direction` prop.
   - Keep the composer panel at **default 20%**, **minimum 15%**, **maximum 35%**.
   - Give the composer content real vertical space with a stable layout so the formatting toolbar, editor field, new-page button, and send button are always visible and usable.
   - Make the drag handle visibly horizontal and draggable between messages and composer.

2. **Fix the workspaces panel sizing/resizing**
   - Correct the shell resizable panel API usage from `orientation` to `direction` so horizontal resizing works.
   - When open, make the workspaces panel exactly **10%** of the full app width by default.
   - Keep it absent when closed, so it consumes **0%**.
   - Add practical resize bounds around the open state so it is not tiny and the central area resizes correctly around it.
   - Keep the existing open/close button behavior intact.

3. **Fix mention icon visibility**
   - Update mention chip/icon CSS so user/page/conversation icons render with explicit black stroke/fill behavior on white backgrounds.
   - Cover both editable TipTap content and delivered message bubbles, including SVG children such as paths/circles/rects.

4. **Verify in the running UI**
   - Check that the conversation composer opens with enough height and the handle can resize it.
   - Check that the workspace panel opens at the intended width and can be horizontally resized.
   - Check that mention icons are visible on white backgrounds.