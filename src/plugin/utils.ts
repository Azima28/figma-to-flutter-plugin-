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
    
    const imageFill = fills.find((f: any) => f.type === 'IMAGE' && f.visible);
    if (imageFill) {
        return { type: 'IMAGE', hash: imageFill.imageHash };
    }

    const solidFill = fills.find((f: any) => f.type === 'SOLID' && f.visible);
    if (solidFill) {
        const r = Math.round(solidFill.color.r * 255).toString(16).padStart(2, '0');
        const g = Math.round(solidFill.color.g * 255).toString(16).padStart(2, '0');
        const b = Math.round(solidFill.color.b * 255).toString(16).padStart(2, '0');
        return `${r}${g}${b}`.toUpperCase();
    }
    return null;
}
