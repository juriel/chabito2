export interface SharedContact {
    displayName: string;
    /** Todos los teléfonos del vCard, solo dígitos (con código de país si WhatsApp lo informó). */
    phones: string[];
}

/**
 * Extrae nombre y teléfonos de un vCard como los que envía WhatsApp:
 * `TEL;type=CELL;waid=573001234567:+57 300 123 4567`. Cuando existe `waid` se prefiere
 * porque ya incluye el código de país, a diferencia del número tal como lo escribió quien lo guardó.
 */
export function parseVCard(vcard: string, fallbackName = ''): SharedContact {
    const unfolded = vcard.replace(/\r?\n[ \t]/g, '');
    let fullName = '';
    const phones: string[] = [];

    for (const line of unfolded.split(/\r?\n/)) {
        const separator = line.indexOf(':');
        if (separator < 0) continue;

        const key = line.slice(0, separator);
        const value = line.slice(separator + 1).trim();
        const property = key.split(';')[0]?.toUpperCase();

        if (property === 'FN' && !fullName) {
            fullName = value;
        } else if (property === 'TEL') {
            const waid = /(?:^|;)waid=(\d+)/i.exec(key)?.[1];
            const digits = waid || value.replace(/\D/g, '');
            if (digits && !phones.includes(digits)) phones.push(digits);
        }
    }

    return { displayName: fullName || fallbackName, phones };
}

export function describeSharedContacts(contacts: SharedContact[]): string {
    const lines = contacts.map((contact) => {
        const phones = contact.phones.length ? contact.phones.map((p) => `+${p}`).join(', ') : 'sin teléfono';
        return `- ${contact.displayName || 'Sin nombre'}: ${phones}`;
    });
    const label = contacts.length === 1 ? 'Contacto compartido' : `Contactos compartidos (${contacts.length})`;
    return `[${label}]\n${lines.join('\n')}`;
}
