export function toPascalCase(str: string): string {
    const cleanStr = str.replace(/[^a-zA-Z0-9\/]/g, '_');
    const segments = cleanStr.split('/').filter(s => s.trim().length > 0);
    
    // Gabungkan SEMUA segmen untuk menjamin keunikan (misal: "screen/main" -> "ScreenMain")
    const pascalResult = segments.map(seg => {
        return seg.replace(/(_+|^)([a-zA-Z0-9])/g, (_, __, char) => char.toUpperCase());
    }).join('');

    return pascalResult || 'FigmaDesign'; // Fallback jika nama kosong
}

export function extractFills(fills: any): any {
    if (!fills || fills.length === 0 || fills === figma.mixed) return null;
    
    // Only extract the first visible fill
    const visibleFills = (fills as Paint[]).filter(f => f.visible);
    if (visibleFills.length === 0) return null;

    const imageFill = visibleFills.find((f: any) => f.type === 'IMAGE') as ImagePaint | undefined;
    if (imageFill) {
        return { type: 'IMAGE', hash: imageFill.imageHash };
    }

    const solidFill = visibleFills.find((f: any) => f.type === 'SOLID') as SolidPaint | undefined;
    if (solidFill) {
        const r = Math.round(solidFill.color.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(solidFill.color.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(solidFill.color.b * 255).toString(16).padStart(2, '0');
        return `${r}${g}${b}`.toUpperCase();
    }
    return null;
}

export function extractStrokes(node: any): any {
    if (!node.strokes || node.strokes.length === 0 || node.strokes === figma.mixed) {
        console.log(`[Strokes] Node "${node.name}" tidak memiliki stroke.`);
        return null;
    }
    
    const visibleStrokes = (node.strokes as Paint[]).filter(s => s.visible);
    if (visibleStrokes.length === 0) {
        console.log(`[Strokes] Node "${node.name}" punya stroke tapi tidak visible.`);
        return null;
    }

    const solidStroke = visibleStrokes.find((s: any) => s.type === 'SOLID') as SolidPaint | undefined;
    if (solidStroke) {
        const r = Math.round(solidStroke.color.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(solidStroke.color.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(solidStroke.color.b * 255).toString(16).padStart(2, '0');
        const strokeData = {
            color: `${r}${g}${b}`.toUpperCase(),
            weight: node.strokeWeight || 1
        };
        console.log(`[Strokes] TERDETEKSI di "${node.name}":`, strokeData);
        return strokeData;
    }
    return null;
}
