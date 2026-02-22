/**
 * Unit tests for HTML processing in apiAdapter
 * Tests pure string manipulation functions for removing heading tags and newlines
 */

describe('HTML Processing', () => {

    describe('Outline-style headings in lists', () => {
        it('should remove newlines from outline-style headings in lists', () => {
            const html = '<li><h2>Heading</h2>\n<ul><li>Item</li></ul></li>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toContain('Heading <ul>');
            expect(result).not.toContain('\n');
        });

        it('should handle real Obsidian HTML from outline-style notes', () => {
            const html = `<li dir="auto">
Heading
<ul><li dir="auto"><a data-href="Scratchpad" href="Scratchpad" class="internal-link">Scratchpad</a></li></ul>
</li>`;

            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');

            expect(result).not.toMatch(/Heading\s*\n/);
            expect(result).toContain('Heading <ul>');
        });

        it('should handle outline-style bullet points', () => {
            const html = `<div class="influx-entry">
<ul><li dir="auto">Heading
<ul><li dir="auto"><a>Scratchpad</a></li></ul>
</li></ul>
</div>`;

            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');

            expect(result).not.toMatch(/Heading\s*\n/);
            expect(result).toContain('Heading <ul>');
        });
    });

    describe('Multiple consecutive newlines', () => {
        it('should replace multiple newlines with single space', () => {
            const html = '<h2>Line1\n\n\nLine2</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Line1 Line2');
        });

        it('should handle multiple newlines with different line ending types', () => {
            const html = '<h2>Line1\n\r\n\rLine2</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Line1 Line2');
        });
    });

    describe('Different line ending types', () => {
        it('should handle Windows line endings (\\r\\n)', () => {
            const html = '<h2>Line1\r\nLine2</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Line1 Line2');
            expect(result).not.toContain('\r');
            expect(result).not.toContain('\n');
        });

        it('should handle Unix line endings (\\n)', () => {
            const html = '<h2>Line1\nLine2</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Line1 Line2');
            expect(result).not.toContain('\n');
        });

        it('should handle old Mac line endings (\\r)', () => {
            const html = '<h2>Line1\rLine2</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Line1 Line2');
            expect(result).not.toContain('\r');
        });

        it('should handle mixed line endings', () => {
            const html = '<h2>Line1\nLine2\r\nLine3\rLine4</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Line1 Line2 Line3 Line4');
        });
    });

    describe('Mixed heading and paragraph tags', () => {
        it('should clean mixed heading and paragraph content', () => {
            const html = '<h2>Title</h2>\n<p>Content</p>';
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Title Content');
        });

        it('should handle multiple headings and paragraphs', () => {
            const html = '<h2>H1</h2>\n<p>P1</p>\n<h3>H2</h3>\n<p>P2</p>';
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('H1 P1 H2 P2');
        });
    });

    describe('Entry headers (existing functionality)', () => {
        it('should preserve entry headers with spans', () => {
            const html = '<h2><span>Tuesday, February 17th, 2026</span></h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toContain('<span>Tuesday, February 17th, 2026</span>');
        });

        it('should preserve entry headers without spans', () => {
            const html = '<h2>Tuesday, February 17th, 2026</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Tuesday, February 17th, 2026');
        });
    });

    describe('No newlines (regression tests)', () => {
        it('should handle content without newlines', () => {
            const html = '<h2>Heading</h2>Content';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            // No newline in original, so no space added
            expect(result).toBe('HeadingContent');
        });

        it('should handle content with newline between heading and text', () => {
            const html = '<h2>Heading</h2>\nContent';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            // Newline in original, so space added
            expect(result).toBe('Heading Content');
        });

        it('should handle simple bullet content', () => {
            const html = '<li>Some content here</li>';
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('<li>Some content here</li>');
        });
    });

    describe('Leading/trailing newlines', () => {
        it('should trim leading newlines', () => {
            const html = '\n<h2>Heading</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ')
                .trim();
            expect(result).toBe('Heading');
        });

        it('should trim trailing newlines', () => {
            const html = '<h2>Heading</h2>\n';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ')
                .trim();
            expect(result).toBe('Heading');
        });

        it('should trim both leading and trailing newlines', () => {
            const html = '\n\n<h2>Heading</h2>\n\n';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ')
                .trim();
            expect(result).toBe('Heading');
        });
    });

    describe('Multiple headings', () => {
        it('should handle multiple headings with newlines', () => {
            const html = '<h2>H1</h2>\nContent\n<h3>H2</h3>\nMore';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('H1 Content H2 More');
        });

        it('should handle different heading levels', () => {
            const html = '<h1>H1</h1>\n<h2>H2</h2>\n<h3>H3</h3>\n<h6>H6</h6>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('H1 H2 H3 H6');
        });
    });

    describe('Heading attributes', () => {
        it('should handle headings with attributes', () => {
            const html = '<h2 class="heading" dir="auto">Heading</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Heading');
        });

        it('should handle headings with multiple attributes', () => {
            const html = '<h2 id="test" class="heading" data-value="123">Heading</h2>';
            const result = html
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Heading');
        });
    });

    describe('Paragraph tags', () => {
        it('should remove paragraph tags', () => {
            const html = '<p>Content</p>';
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Content');
        });

        it('should remove paragraph tags with attributes', () => {
            const html = '<p class="test">Content</p>';
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Content');
        });

        it('should handle multiple paragraphs', () => {
            const html = '<p>Para1</p>\n<p>Para2</p>';
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toBe('Para1 Para2');
        });
    });

    describe('Combined scenarios', () => {
        it('should handle complex outline-style content', () => {
            const html = `<div class="influx-entries">
<h2><span>Tuesday, February 17th, 2026</span></h2>
<div class="influx-entry">
<ul><li dir="auto">Heading
<ul><li dir="auto"><a data-href="Scratchpad">Scratchpad</a></li></ul>
</li></ul>
</div>
</div>`;
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');

            expect(result).toContain('<span>Tuesday, February 17th, 2026</span>');
            expect(result).not.toMatch(/Heading\s*\n/);
            expect(result).toContain('Heading <ul>');
        });

        it('should handle content with multiple tag types', () => {
            const html = '<div>\n<h2>Heading</h2>\n<p>Para1</p>\n<h3>Subheading</h3>\n<p>Para2</p>\n</div>';
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');
            expect(result).toContain('Heading Para1 Subheading Para2');
            expect(result).not.toContain('\n');
        });

        it('should preserve HTML structure while cleaning newlines', () => {
            const html = `<ul>
<li><h2>Heading</h2>\n<ul><li>Item1</li><li>Item2</li></ul>
</li>
<li><h2>Another</h2>\nContent here
</li>
</ul>`;
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ');

            expect(result).toContain('<ul>');
            expect(result).toContain('<li>');
            expect(result).toContain('Heading <ul><li>Item1</li><li>Item2</li></ul>');
            expect(result).toContain('Another Content here');
            expect(result).not.toMatch(/Heading\s*\n/);
        });

        it('should not corrupt tag names while sanitizing summary html', () => {
            const html = '\n<p>Para</p>\n<h2>Heading</h2>\n<ul><li>Item</li></ul>\n';
            const result = html
                .replace(/<\/?p[^>]*>/gi, '')
                .replace(/<\/?h[1-6][^>]*>/gi, '')
                .replace(/(\r\n|\n|\r)+/g, ' ')
                .trim();

            expect(result).toContain('Para Heading');
            expect(result).toContain('<ul><li>Item</li></ul>');
            expect(result).not.toContain('<>');
        });
    });
});
