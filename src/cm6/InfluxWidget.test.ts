/** @jest-environment jsdom */

jest.mock('../InfluxReactComponent', () => (): null => null);
jest.mock('react-dom/client', () => ({
    createRoot: jest.fn(() => ({ render: jest.fn(), unmount: jest.fn() })),
}));

import { createRoot } from 'react-dom/client';
import { InfluxWidget } from './InfluxWidget';

function fileFixture() {
    return { uuid: 'test', file: { path: 'Target.md' }, influx: {
        stylesheet: {}, deregisterInfluxComponent: jest.fn(),
    } } as any;
}

test('new content for the same note replaces the old widget', () => {
    const oldFile = fileFixture();
    const oldWidget = new InfluxWidget({ influxFile: oldFile, show: true });
    expect(oldWidget.eq(new InfluxWidget({ influxFile: fileFixture(), show: true }))).toBe(false);
    expect(oldWidget.eq(new InfluxWidget({ influxFile: oldFile, show: true }))).toBe(true);
});

test('temporary DOM detachment keeps the widget alive until CodeMirror destroys it', () => {
    const file = fileFixture();
    const widget = new InfluxWidget({ influxFile: file, show: true });
    const element = widget.toDOM();
    const results = (createRoot as jest.Mock).mock.results;
    const root = results[results.length - 1].value;
    document.body.append(element);
    element.remove();
    element.dispatchEvent(new CustomEvent('disconnected'));
    document.body.append(element);
    expect(root.unmount).not.toHaveBeenCalled();
    expect(file.influx.deregisterInfluxComponent).not.toHaveBeenCalled();
    widget.destroy(element);
    widget.destroy(element);
    expect(root.unmount).toHaveBeenCalledTimes(1);
    element.remove();
});

test('reuses the React root when updating the same note', () => {
    const widget = new InfluxWidget({ influxFile: fileFixture(), show: true });
    const element = widget.toDOM();
    const results = (createRoot as jest.Mock).mock.results;
    const root = results[results.length - 1].value;
    const updated = new InfluxWidget({ influxFile: fileFixture(), show: true });
    expect(updated.updateDOM(element)).toBe(true);
    expect(root.render).toHaveBeenCalledTimes(2);
    expect(root.unmount).not.toHaveBeenCalled();
    const differentNote = fileFixture();
    differentNote.file.path = 'Other.md';
    expect(new InfluxWidget({ influxFile: differentNote, show: true }).updateDOM(element)).toBe(false);
    updated.destroy(element);
});
