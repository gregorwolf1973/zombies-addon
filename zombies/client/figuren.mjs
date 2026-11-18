// Spielfiguren von oben – Entwurf von DeepSeek (v4-pro, 2. Runde nach Claude-Rückmeldung)
// Spielfiguren von oben – Entwurf von DeepSeek (v4-pro, 2. Runde nach Claude-Rückmeldung)
// Spielfiguren von oben – Entwurf von DeepSeek (v4-pro), von Claude geprüft
// figuren.mjs
// Zeichenfunktionen für Spielfiguren eines Top-down-Zombiespiels
// Alle Figuren blicken nach rechts (+x), Ursprung (0,0) in der Mitte der Figur
// Comic-Stil, Vogelperspektive, kräftige Konturen, einfache Schattierung

/**
 * Zeichnet einen Menschen von oben (Vogelperspektive)
 * @param {CanvasRenderingContext2D} ctx - Zeichenkontext
 * @param {string} farbe - Jackenfarbe (CSS-Farbe)
 * @param {number|null} phase - Laufphase 0..1, null = stehen
 * @param {object} art - { haar: string, hut?: boolean }
 */
export function zeichneMensch(ctx, farbe, phase, art) {
    const stehend = phase === null;
    const t = stehend ? 0 : phase;
    const armSchwung = stehend ? 0 : Math.sin(t * Math.PI * 2) * 5;
    const fussSchwung = stehend ? 0 : Math.sin(t * Math.PI * 2) * 6;

    ctx.save();

    // Weicher Schatten unter der Figur
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Füße / Schuhe (erscheinen abwechselnd vor +x und hinter -x den Schultern)
    ctx.fillStyle = '#3e2723';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    // Linker Fuß (oben, y negativ)
    ctx.beginPath();
    ctx.ellipse(fussSchwung * 0.8, -9, 4, 3, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rechter Fuß (unten, y positiv)
    ctx.beginPath();
    ctx.ellipse(-fussSchwung * 0.8, 9, 4, 3, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Arme (oben und unten an den Schultern, schwingen entlang x)
    ctx.fillStyle = farbe;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;

    // Linker Arm (oben, y negativ) – schmaler Schlauch
    ctx.beginPath();
    ctx.ellipse(armSchwung * 0.7, -12, 5, 2.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rechter Arm (unten, y positiv) – schmaler Schlauch
    ctx.beginPath();
    ctx.ellipse(-armSchwung * 0.7, 12, 5, 2.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hände (Hautfarbe)
    ctx.fillStyle = '#ffcc80';
    ctx.beginPath();
    ctx.arc(armSchwung * 0.7 + 5, -12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-armSchwung * 0.7 - 5, 12, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Oberkörper / Schultern – schmale, abgerundete Form quer zur Blickrichtung
    // Etwa 22 px lang in y, nur 9–10 px breit in x
    ctx.fillStyle = farbe;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Schattierung Oberkörper (hellere Fläche oben links)
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.ellipse(-2, -3, 5, 6, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Kopf (kleiner, Durchmesser 11 px, leicht nach vorn +x versetzt)
    const kopfX = 3;
    const kopfY = 0;
    ctx.fillStyle = '#ffcc80';
    ctx.beginPath();
    ctx.arc(kopfX, kopfY, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Haare oder Hut (von oben sichtbar)
    if (art.hut) {
        // Trachtenhut mit Krempe (von oben)
        ctx.fillStyle = '#4e342e';
        ctx.beginPath();
        ctx.ellipse(kopfX, kopfY, 7, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.ellipse(kopfX, kopfY, 4.5, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Hutband
        ctx.fillStyle = '#8d6e63';
        ctx.beginPath();
        ctx.ellipse(kopfX, kopfY, 4.5, 2.5, 0, 0, Math.PI * 2);
        ctx.fill();
    } else {
        // Haare (oben auf dem Kopf, von oben gesehen)
        ctx.fillStyle = art.haar || '#5d4037';
        ctx.beginPath();
        ctx.arc(kopfX, kopfY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        // Kleine Nasenspitze am rechten Rand des Kopfes
        ctx.fillStyle = '#ffcc80';
        ctx.beginPath();
        ctx.arc(kopfX + 5, kopfY, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }

    ctx.restore();
}

/**
 * Zeichnet einen Zombie von oben (gebückt, Arme nach vorn)
 * @param {CanvasRenderingContext2D} ctx - Zeichenkontext
 * @param {number} variante - 0..3 bestimmt Hemdfarbe
 * @param {number|null} phase - Laufphase 0..1, null = stehend
 */
export function zeichneZombie(ctx, variante, phase) {
    const stehend = phase === null;
    const t = stehend ? 0 : phase;
    const armPendel = stehend ? 0 : Math.sin(t * Math.PI * 2) * 2.5;
    const wackel = stehend ? 0 : Math.sin(t * Math.PI * 2) * 3;
    const fussSchwung = stehend ? 0 : Math.sin(t * Math.PI * 2) * 5;

    const hemdFarben = ['#5d4037', '#37474f', '#6a1b9a', '#8d6e63'];
    const hemd = hemdFarben[variante % 4];

    ctx.save();
    ctx.rotate((wackel * Math.PI) / 180);

    // Weicher Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Füße (erscheinen abwechselnd vor +x und hinter -x den Schultern)
    ctx.fillStyle = '#3e2723';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    // Linker Fuß (oben, y negativ)
    ctx.beginPath();
    ctx.ellipse(fussSchwung * 0.7, -9, 4.5, 3, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rechter Fuß (unten, y positiv)
    ctx.beginPath();
    ctx.ellipse(-fussSchwung * 0.7, 9, 4.5, 3, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Körper (Schulter-Oval quer zur Blickrichtung, in y lang)
    ctx.fillStyle = hemd;
    ctx.beginPath();
    ctx.ellipse(0, 0, 13, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Risse im Hemd (dunkle Striche)
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, -6);
    ctx.lineTo(-1, -2);
    ctx.lineTo(-5, 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.lineTo(3, 0);
    ctx.lineTo(7, 3);
    ctx.stroke();

    // Schattierung Körper
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.ellipse(-2, -4, 8, 7, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Arme (beide parallel nach vorn +x gestreckt, pendeln leicht in y)
    ctx.fillStyle = '#7cb342';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;

    // Oberarm links (oben, y negativ)
    ctx.beginPath();
    ctx.ellipse(5, -8 + armPendel, 7, 3.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Oberarm rechts (unten, y positiv)
    ctx.beginPath();
    ctx.ellipse(5, 8 - armPendel, 7, 3.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Unterarme + Hände mit Krallen
    ctx.fillStyle = '#7cb342';
    // Linke Hand
    ctx.beginPath();
    ctx.ellipse(13, -8 + armPendel, 4, 3, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rechte Hand
    ctx.beginPath();
    ctx.ellipse(13, 8 - armPendel, 4, 3, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Krallenfinger
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, -10 + armPendel);
    ctx.lineTo(19, -11 + armPendel);
    ctx.moveTo(16, -8 + armPendel);
    ctx.lineTo(19, -8 + armPendel);
    ctx.moveTo(16, -6 + armPendel);
    ctx.lineTo(19, -5 + armPendel);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(16, 6 - armPendel);
    ctx.lineTo(19, 5 - armPendel);
    ctx.moveTo(16, 8 - armPendel);
    ctx.lineTo(19, 8 - armPendel);
    ctx.moveTo(16, 10 - armPendel);
    ctx.lineTo(19, 11 - armPendel);
    ctx.stroke();

    // Kopf (grün, kahl, etwas vor +x der Schultermitte)
    ctx.fillStyle = '#7cb342';
    ctx.beginPath();
    ctx.arc(3, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Schattierung Kopf
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(1, -2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Rote Augenpunkte am rechten Kopfrand
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath();
    ctx.arc(9, -2, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(9, 2, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Augen glänzen
    ctx.fillStyle = '#ff5252';
    ctx.beginPath();
    ctx.arc(9.5, -2.5, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(9.5, 1.5, 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/**
 * Zeichnet einen kriechenden Zombie (auf dem Bauch, wie eine Zombiefrau)
 * @param {CanvasRenderingContext2D} ctx - Zeichenkontext
 * @param {number} variante - 0..3 bestimmt Kleidfarbe
 * @param {number|null} phase - Bewegungsphase 0..1, null = still
 */
export function zeichneKriecher(ctx, variante, phase) {
    const stehend = phase === null;
    const t = stehend ? 0 : phase;
    const greif = stehend ? 0 : Math.sin(t * Math.PI * 2) * 3;

    const kleidFarben = ['#4a148c', '#1a237e', '#3e2723', '#4e342e'];
    const kleid = kleidFarben[variante % 4];

    ctx.save();

    // Weicher Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Beine hinten nachschleifend
    ctx.fillStyle = '#7cb342';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    // Linkes Bein
    ctx.beginPath();
    ctx.ellipse(-10, 6, 4, 7, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rechtes Bein
    ctx.beginPath();
    ctx.ellipse(-14, 3, 4, 7, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Füße
    ctx.fillStyle = '#3e2723';
    ctx.beginPath();
    ctx.ellipse(-12, 12, 4, 2.5, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-17, 8, 4, 2.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Körper (lang gestreckt, etwa 40×20 px)
    ctx.fillStyle = kleid;
    ctx.beginPath();
    ctx.ellipse(0, 0, 18, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Risse im Kleid
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-8, -5);
    ctx.lineTo(-4, -1);
    ctx.lineTo(-9, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, -6);
    ctx.lineTo(2, -2);
    ctx.lineTo(6, 2);
    ctx.stroke();

    // Dunkelrote Flecken
    ctx.fillStyle = 'rgba(139,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(-5, 2, 3, 2, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(4, -3, 2.5, 2, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Schattierung Körper
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(-4, -4, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arme weit nach vorn gestreckt, abwechselnd greifend
    ctx.fillStyle = '#7cb342';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;

    // Linker Arm
    ctx.beginPath();
    ctx.ellipse(10, -5 + greif, 8, 3.5, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rechter Arm
    ctx.beginPath();
    ctx.ellipse(10, 5 - greif, 8, 3.5, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hände mit Krallen
    ctx.fillStyle = '#7cb342';
    ctx.beginPath();
    ctx.ellipse(19, -5 + greif, 3.5, 3, -0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(19, 5 - greif, 3.5, 3, 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Krallenfinger
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(22, -7 + greif);
    ctx.lineTo(25, -8 + greif);
    ctx.moveTo(22, -5 + greif);
    ctx.lineTo(25, -5 + greif);
    ctx.moveTo(22, -3 + greif);
    ctx.lineTo(25, -2 + greif);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(22, 3 - greif);
    ctx.lineTo(25, 2 - greif);
    ctx.moveTo(22, 5 - greif);
    ctx.lineTo(25, 5 - greif);
    ctx.moveTo(22, 7 - greif);
    ctx.lineTo(25, 8 - greif);
    ctx.stroke();

    // Kopf vorne (+x)
    ctx.fillStyle = '#7cb342';
    ctx.beginPath();
    ctx.arc(8, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Schattierung Kopf
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(6, -2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Wirres langes Haar auf dem Kopf
    ctx.fillStyle = '#4e342e';
    ctx.beginPath();
    ctx.arc(8, 0, 6.5, Math.PI * 0.7, Math.PI * 1.7);
    ctx.quadraticCurveTo(2, -8, 8, -9);
    ctx.quadraticCurveTo(14, -8, 12, -4);
    ctx.quadraticCurveTo(10, -6, 8, -5);
    ctx.fill();
    ctx.stroke();

    // Einzelne Haarsträhnen
    ctx.strokeStyle = '#3e2723';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(4, -4);
    ctx.quadraticCurveTo(2, -7, 5, -8);
    ctx.moveTo(8, -5);
    ctx.quadraticCurveTo(8, -8, 8, -9);
    ctx.moveTo(12, -4);
    ctx.quadraticCurveTo(14, -7, 11, -8);
    ctx.stroke();

    // Rote Augenpunkte
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath();
    ctx.arc(12, -2, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, 2, 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/**
 * Zeichnet einen toten Zombie auf dem Rücken liegend (X-Position)
 * @param {CanvasRenderingContext2D} ctx - Zeichenkontext
 * @param {number} variante - 0..3 bestimmt Hemdfarbe
 */
export function zeichneLeiche(ctx, variante) {
    const hemdFarben = ['#5d4037', '#37474f', '#6a1b9a', '#8d6e63'];
    const hemd = hemdFarben[variante % 4];

    ctx.save();

    // Dunkelrote Lache unter der Leiche
    ctx.fillStyle = 'rgba(139,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 2, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // Weicher Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 3, 20, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Beine gespreizt (hinten, -x)
    ctx.fillStyle = '#4e342e';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    // Linkes Bein (oben)
    ctx.beginPath();
    ctx.ellipse(-10, -10, 4, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rechtes Bein (unten)
    ctx.beginPath();
    ctx.ellipse(-10, 10, 4, 8, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Füße
    ctx.fillStyle = '#3e2723';
    ctx.beginPath();
    ctx.ellipse(-15, -15, 4, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-15, 15, 4, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Arme über dem Kopf gespreizt (vorne, +x)
    ctx.fillStyle = '#7cb342';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;

    // Linker Arm (oben)
    ctx.beginPath();
    ctx.ellipse(10, -10, 4, 8, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Rechter Arm (unten)
    ctx.beginPath();
    ctx.ellipse(10, 10, 4, 8, 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hände
    ctx.fillStyle = '#7cb342';
    ctx.beginPath();
    ctx.ellipse(15, -15, 3.5, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(15, 15, 3.5, 3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Körper (Hemd)
    ctx.fillStyle = hemd;
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Risse
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, -5);
    ctx.lineTo(-2, -1);
    ctx.lineTo(-6, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, -4);
    ctx.lineTo(2, 0);
    ctx.lineTo(6, 4);
    ctx.stroke();

    // Blut auf dem Hemd
    ctx.fillStyle = 'rgba(139,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(-3, 2, 4, 3, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(4, -3, 3, 2.5, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Kopf vorne (+x)
    ctx.fillStyle = '#7cb342';
    ctx.beginPath();
    ctx.arc(8, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Schattierung Kopf
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(6, -2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Kahler Kopf mit ein paar Haarbüscheln
    ctx.fillStyle = '#4e342e';
    ctx.beginPath();
    ctx.arc(8, 0, 6.5, Math.PI * 0.6, Math.PI * 1.4);
    ctx.quadraticCurveTo(4, -7, 8, -8);
    ctx.quadraticCurveTo(12, -7, 11, -3);
    ctx.fill();
    ctx.stroke();

    // Rote Augen (tot, halb geschlossen)
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath();
    ctx.ellipse(12, -2, 2, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(12, 2, 2, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

/**
 * Zeichnet einen verletzten Menschen, der am Boden liegt (seitlich, eingerollt)
 * @param {CanvasRenderingContext2D} ctx - Zeichenkontext
 * @param {string} farbe - Jackenfarbe (CSS-Farbe)
 * @param {object} art - { haar: string, hut?: boolean }
 */
export function zeichneMenschLiegend(ctx, farbe, art) {
    ctx.save();

    // Weicher Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 16, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Beine (angewinkelt, seitlich)
    ctx.fillStyle = '#3e2723';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    // Oberschenkel
    ctx.beginPath();
    ctx.ellipse(-8, 6, 4, 6, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-12, 2, 4, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Füße
    ctx.fillStyle = '#3e2723';
    ctx.beginPath();
    ctx.ellipse(-10, 12, 3.5, 2.5, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(-16, 7, 3.5, 2.5, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Körper (eingerollt, seitlich) – schlanker
    ctx.fillStyle = farbe;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 7, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Schattierung Körper
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.ellipse(-3, -3, 6, 4, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // Arme (vor dem Körper verschränkt) – schmaler
    ctx.fillStyle = farbe;
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.ellipse(5, -4, 3.5, 5, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(8, 2, 3.5, 5, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Hände
    ctx.fillStyle = '#ffcc80';
    ctx.beginPath();
    ctx.arc(8, -8, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(11, 6, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Kopf (seitlich, auf dem Boden) – kleiner
    ctx.fillStyle = '#ffcc80';
    ctx.beginPath();
    ctx.arc(8, -2, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Haare oder Hut
    if (art.hut) {
        // Hut seitlich
        ctx.fillStyle = '#4e342e';
        ctx.beginPath();
        ctx.ellipse(8, -6, 7, 3.5, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#5d4037';
        ctx.beginPath();
        ctx.ellipse(8, -8, 4.5, 3.5, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    } else {
        // Haare
        ctx.fillStyle = art.haar || '#5d4037';
        ctx.beginPath();
        ctx.arc(8, -2, 5, Math.PI * 0.8, Math.PI * 1.8);
        ctx.quadraticCurveTo(4, -8, 8, -9);
        ctx.quadraticCurveTo(12, -8, 13, -4);
        ctx.fill();
        ctx.stroke();
    }

    // Blutlache unter dem Körper
    ctx.fillStyle = 'rgba(139,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 6, 9, 5, 0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}
