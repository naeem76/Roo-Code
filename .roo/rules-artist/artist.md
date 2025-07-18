# Styling principles & coding preferences for front-end dev

## Save time and work
- Any time user asks you to create a new page. Copy the layout that is consistent with the rest of the site, including being responsive in the same way the rest of the site is.
- Make liberal use of the `codebase_search` tool for searching/finding any files, functions, objects, or content.

## Terminology
Hereinafter, on the front end, objects are synonymous with controls.

## Styling

### CSS Frameworks
This project is not using Tailwind or Bootstrap.

### CSS files
- Use only one .css file unless absolutely necessary to have more. If it seems there is a need for more, ask user.
- Keep comments in css to a minimum.
- Keep decorative ```/* ===== */``` followed by ```/* Name of section */``` and another ```/* ===== */``` to one row; ```/* Name of section */```.

### Design System Consistency & Separation of concerns
Emphasize creating/keeping to a unified and reusable set of design and coding standards across the application (admin side and user side). Promote reusable components and patterns to maintain visual and functional consistency.

### Consistent spacing and rhythm
Ensure consistent (same on every page) vertical and horizontal rhythm throughout the application's forms by standardizing spacing through the use of CSS classes and CSS variables found in @\static\main.css (CSS File). Before using a class on a page, ensure that class exists in our CSS File. If it does not, use a class that similar already-built pages use.

### Separation of Concerns
Avoid inline CSS, preferring use of our CSS File, embracing the principle of separating content (HTML), presentation (CSS), and behavior (JavaScript). This improves maintainability, scalability, and readability of the codebase.

### Examples

#### Form input spacing
- Horizontal padding for text inputs: Ensure padding of input boxes is at least a few pixels on left and right, but not much on top and bottom.
- Ensure top and bottom margins of all elements is minimal.
- Keep form labels vertically close from the form input box they are paired with.
- Pack sets of parameters into as many classes as possible, like so:
``` css
.form-input, input.form-input, select.form-input, textarea.form-input {
    background-color: var(--color-background);
    padding-left: var(--spacing-1);
    padding-right: var(--spacing-1);
    padding-top: var(--spacing-0);
    padding-bottom: var(--spacing-0);
    color: var(--color-text-primary);
    font-size: var(--font-size-base);
    line-height: var(--line-height-normal);
    border-radius: var(--border-radius-lg);
    margin-top: var(--spacing-1);
    margin-bottom: var(--spacing-1);
    border: 1px solid var(--color-border-faint);
    box-shadow: none;
    width: 100%;
}
```

#### Curved Corners
Default to curved corners (border-radius) on all objects. If in doubt, check other already-built pages and follow their layout.

#### Cards, forms, and form groups
Prefer simple with compact spacing.
- Forms that move around when they get user focus can be unnerving; keep them still. Maybe change border color from something faint to something more visible as a subtle indication of focus.
- For forms with many objects/controls, ask user if they would like sections of objects hide-able/expose-able via buttons, to incrase how compact the overall form is.

#### Checkbox and radio control label spacing
- For all checkboxes and radio button controls: Ensure spacing between control (checkbox or radio button) and their labels is consistent and the following width: 4px, preferably accomplished using css variables in the main.css file.

#### Buttons
As with the other objects, keep buttons simple.
- No need for borders.
- Upon hover, change background colors. Keep caption white.
- Notice and follow this practice: there are 3 kinds of buttons: nav-link (used only in navigation (layout.html)), btn (default; most buttons in app), and btn-submit (for form submissions). 

### Accessibility
For now, we're favoring simplicity over accessibility.
- No ARIA-related features.
- Yes to simple and highly-compatible accessibility.

### Movement
Keep movement to a minimum. If a transition or animation seems necessary, propose the idea to the user.

## JavaScript
- Keep code sections vertically compact.
- Comment liberally.
The following rules benefit greatly from use of the `codebase_search` tool:
- Always look for existing code to iterate on instead of creating new code.
- Avoid creating new files for new functions when an existing file has functions of a similar category. So search all projects files first to determine if a similar function already exists. Use indexing tool for these kind of searches.

## After completion of code changes
Until user has confirmed they have tested, do not assume your changes were tested and working. 
- After every set of code changes has completed, check the "Problems" area at the bottom of VS Code and fix any issues shown there. 
- If appropriate, ask user if they want you to run tests.
- If the changes affected visual layout or anything that could be tested in the browser, run the best browser tool for the situation through the appropriate mode.