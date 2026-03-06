# Influx Documentation

**Influx** adds context to Obsidian backlinks by showing excerpts around each link. This helps you review connections without opening every source note.

![Obsidian Influx screenshot](assets/screencap.png)

## Why Influx?

Obsidian's core backlinks show *that* notes are connected. Influx shows *how* they are connected by including nearby text.

Perfect for:

- **Research notes**: Review surrounding context instead of jumping through files
- **Knowledge management**: Keep backlinks usable as your vault grows
- **Writing workflows**: Check linked references without leaving the current note
- **Focused setups**: Control where Influx appears and which sources are included

This guide covers setup and the settings available in the current plugin.

## Quick Start

Once installed and enabled, Influx automatically appears at the bottom of your notes showing contextual backlinks. 

**Basic setup**: Go to **Settings** → **Community Plugins** → **Influx** to customize your experience.

## Configuration

### Display Options

- **Sorting attribute**: Order backlinks by `mtime`, `ctime`, or `FILENAME`
  - *Recommended*: `mtime` for active work
  - *Reference vaults*: `FILENAME` for predictable lookup

- **Sorting principle**: Choose `NEWEST_FIRST` or `OLDEST_FIRST`
  - *Recommended*: `NEWEST_FIRST`

- **List length**: Limit how many linked notes are rendered
  - *Recommended*: `10-15`
  - *Large vaults*: `5-10` for faster first paint

### Layout Settings

- **Layout variant**: `Continuous stream` or `Note by note`

- **Show Influx below text**: Place Influx below the note body or at the top

- **Show headers**: Show a source title when available

### Filtering

- **Target pages (where Influx is shown)**:
  - `Default behaviour` + `Exclude pages`/`Include pages` patterns

- **Source notes (where backlinks are gathered from)**:
  - `Default behaviour` + `Exclude notes`/`Include notes` patterns

- **Require frontmatter key**: Only show Influx on notes with `influx: true`
- **Collapse all by default**: Start every note with backlink entries collapsed

## Usage Examples

### Academic Research

**Scenario**: Writing a literature review for your thesis

**Configuration**:

- Sorting attribute: `mtime`
- Sorting principle: `NEWEST_FIRST`
- List length: `15`
- Layout variant: `Note by note`

This setup prioritizes recently edited sources and keeps each source grouped.

### Knowledge Management

**Scenario**: Building a personal knowledge base on machine learning

**Configuration**:

- Sorting attribute: `FILENAME`
- Sorting principle: `NEWEST_FIRST`
- List length: `25`
- Display location: `Sidebar`

This setup gives stable ordering by note name and keeps results visible in one panel.

### Creative Writing

**Scenario**: Tracking character development in a novel

**Configuration**:

- Sorting attribute: `mtime`
- Sorting principle: `NEWEST_FIRST`
- List length: `10`
- Collapse all by default: `Enabled`

This setup keeps the list compact and reduces initial visual noise.

## Advanced Features

### Custom CSS

Add custom styles to match your Obsidian theme:

```css
/* Source file row */
.influx-component .search-result-file-title {
  font-weight: 600;
}

/* Individual excerpt block */
.influx-entry {
  margin-bottom: 0.5rem;
}

/* Compact spacing for mobile */
@media (max-width: 768px) {
  .influx-component .search-result-file-matches {
    margin-left: 0.75rem;
  }
}
```

### Front Matter Integration

Influx can include links from front matter when **Include links from front matter properties** is enabled.

- Use **Front matter properties** to limit processing to specific property names.
- Leave **Front matter properties** empty to consider links from all front matter properties.

**Example front matter**:

```yaml
---
tags: [research, psychology]
related: [[cognitive-bias]], [[decision-making]]
project: thesis-chapter-2
---
```

### Performance Tips

For large vaults or optimal performance:

1. **Reduce List length**: Limit to 5-10 items for faster rendering
2. **Use source filtering**: Exclude templates, archive, and high-churn folders
3. **Disable live update**: Reduce update churn while writing
4. **Use Sidebar mode**: Keep one render target when reviewing many notes

## Troubleshooting

### Backlinks not showing

1. Ensure Influx is enabled in Community Plugins
2. Check that the current file has incoming links
3. Verify file indexing is complete in Obsidian
4. Review source/target include-exclude filters and list limit settings

### Performance issues

- Reduce the maximum number of displayed items
- Exclude large folders from indexing
- Disable live update while editing large notes

## Project Maintainers

**Current Maintainer**: [@semanticdata](https://github.com/semanticdata) (Miguel Pimentel)

**Original Creator**: [@jensmtg](https://github.com/jensmtg) (Jens M Gleditsch)

## Contributing <!-- {docsify-ignore} -->

Found a bug or have a feature request? Please [open an issue](https://github.com/jensmtg/influx/issues) on GitHub.

See [CONTRIBUTING](/Contributing) for more detailed information.

## Changelog <!-- {docsify-ignore} -->

See the [Changelog](/Changelog) for version history and updates.
