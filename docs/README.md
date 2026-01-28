# Influx Documentation

**Influx** transforms your Obsidian backlinks from simple links into rich, contextual excerpts that help you discover connections in your notes. Instead of seeing just a list of note titles, you'll see the actual content surrounding each link, giving you immediate context and understanding.

## Why Influx?

Obsidian's core backlinks show you *that* notes are connected, but Influx shows you *how* and *why* they're connected. This transforms your backlinks from a simple navigation tool into a powerful research and discovery engine.

Perfect for:
- **Academic research**: Trace ideas and sources across your knowledge base
- **Knowledge management**: Build interconnected webs of understanding
- **Creative writing**: Track themes, characters, and plot development
- **Personal learning**: Discover unexpected connections in your notes

This guide covers everything from basic setup to advanced customization.

## Quick Start

Once installed and enabled, Influx automatically appears at the bottom of your notes showing contextual backlinks. 

**Basic setup**: Go to **Settings** → **Community Plugins** → **Influx** to customize your experience.

## Configuration

### Display Options

- **Excerpt Length**: Control how much context to show around each backlink
- **Grouping**: Organize backlinks by hierarchy or chronology
- **Sorting**: Choose how to order your backlinks (alphabetical, by date, etc.)

### Layout Settings

- **Max Items**: Limit the number of backlinks shown
- **Show Hierarchy**: Display bullet point structure
- **Compact Mode**: Reduce spacing for dense information

### Filtering

- **Exclude Files**: Hide backlinks from specific files or folders
- **Include Only**: Show backlinks only from selected sources
- **Minimum Context**: Filter out links with insufficient context

## Usage Examples

### Academic Research
Perfect for thesis work and research papers where you need to trace ideas across multiple notes.

### Knowledge Management
Build interconnected knowledge webs that show actual content relationships, not just empty links.

### Creative Writing
Track character development, plot points, and themes across your story notes with rich context.

## Advanced Features

### Custom CSS
Add custom styles to match your Obsidian theme:

```css
.influx-excerpt {
  font-style: italic;
  color: var(--text-muted);
}
```

### Keyboard Shortcuts
- `Ctrl/Cmd + Click` on backlink to jump directly to the source
- `Alt + Hover` to preview the linked note

## Troubleshooting

### Backlinks not showing
1. Ensure Influx is enabled in Community Plugins
2. Check that the current file has incoming links
3. Verify file indexing is complete in Obsidian

### Performance issues
- Reduce the maximum number of displayed items
- Exclude large folders from indexing
- Use compact mode for faster rendering

## Contributing

Found a bug or have a feature request? Please [open an issue](https://github.com/jensmtg/influx/issues) on GitHub.

## Changelog

See the [Changelog](CHANGELOG.md) for version history and updates.
