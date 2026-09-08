const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const gravitySlider = document.getElementById("gravitySlider");
const gravityValue = document.getElementById("gravityValue");

let W = 0;
let H = 0;

let strands = [];

let drawing = false;
let currentStrand = null;

let mouse = {
    x: 0,
    y: 0
};


/* =========================================================
   SETTINGS
========================================================= */

const SEGMENT_LENGTH = 12;

let GRAVITY = 0.28;

const DAMPING = 0.985;
const ITERATIONS = 10;

const EDGE_DISTANCE = 20;
const ATTACH_DISTANCE = 16;

const STRAND_WIDTH = 1.4;


/* =========================================================
   AUDIO SYSTEM
========================================================= */

let audioContext = null;
let masterGain = null;
let lastRustle = 0;


/*
    Browsers block audio until the user interacts
    with the page.

    We initialize it on the first pointer interaction.
*/

function initAudio() {

    if (audioContext)
        return;

    audioContext =
        new (
            window.AudioContext ||
            window.webkitAudioContext
        )();

    masterGain =
        audioContext.createGain();

    masterGain.gain.value = 0.18;

    masterGain.connect(
        audioContext.destination
    );
}


async function resumeAudio() {

    initAudio();

    if (
        audioContext &&
        audioContext.state === "suspended"
    ) {
        await audioContext.resume();
    }
}


/* =========================================================
   SILK STRETCH SOUND
========================================================= */

function playStretchSound(intensity = 0.5) {

    if (!audioContext)
        return;

    const now =
        audioContext.currentTime;

    /*
        Short filtered noise gives a soft
        silk/fabric pulling texture.
    */

    const bufferSize =
        audioContext.sampleRate * 0.08;

    const buffer =
        audioContext.createBuffer(
            1,
            bufferSize,
            audioContext.sampleRate
        );

    const data =
        buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {

        data[i] =
            (Math.random() * 2 - 1);
    }

    const source =
        audioContext.createBufferSource();

    source.buffer = buffer;

    const filter =
        audioContext.createBiquadFilter();

    filter.type = "bandpass";

    filter.frequency.value =
        1800 + intensity * 1800;

    filter.Q.value = 1.2;

    const gain =
        audioContext.createGain();

    gain.gain.setValueAtTime(
        0.0001,
        now
    );

    gain.gain.exponentialRampToValueAtTime(
        0.045 * intensity,
        now + 0.012
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.08
    );

    source
        .connect(filter)
        .connect(gain)
        .connect(masterGain);

    source.start(now);

    source.stop(
        now + 0.09
    );
}


/* =========================================================
   STICK / ATTACH SOUND
========================================================= */

function playAttachSound() {

    if (!audioContext)
        return;

    const now =
        audioContext.currentTime;


    /*
        Small low-frequency impact.
    */

    const oscillator =
        audioContext.createOscillator();

    const gain =
        audioContext.createGain();

    oscillator.type = "sine";

    oscillator.frequency.setValueAtTime(
        190,
        now
    );

    oscillator.frequency.exponentialRampToValueAtTime(
        80,
        now + 0.09
    );

    gain.gain.setValueAtTime(
        0.0001,
        now
    );

    gain.gain.exponentialRampToValueAtTime(
        0.12,
        now + 0.005
    );

    gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.1
    );

    oscillator
        .connect(gain)
        .connect(masterGain);

    oscillator.start(now);

    oscillator.stop(
        now + 0.11
    );


    /*
        Add a tiny high-frequency
        "silk snap" component.
    */

    const click =
        audioContext.createOscillator();

    const clickGain =
        audioContext.createGain();

    click.type = "triangle";

    click.frequency.value = 900;

    clickGain.gain.setValueAtTime(
        0.035,
        now
    );

    clickGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + 0.035
    );

    click
        .connect(clickGain)
        .connect(masterGain);

    click.start(now);

    click.stop(
        now + 0.04
    );
}


/* =========================================================
   WEB RUSTLE
========================================================= */

function playWebRustle(intensity) {

    if (!audioContext)
        return;

    const now =
        performance.now();

    /*
        Don't continuously generate sound.
    */

    if (
        now - lastRustle < 180
    ) {
        return;
    }

    lastRustle = now;

    const audioNow =
        audioContext.currentTime;

    const bufferSize =
        audioContext.sampleRate * 0.12;

    const buffer =
        audioContext.createBuffer(
            1,
            bufferSize,
            audioContext.sampleRate
        );

    const data =
        buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {

        /*
            Fade the noise naturally.
        */

        const envelope =
            1 - i / bufferSize;

        data[i] =
            (
                Math.random() * 2 - 1
            ) * envelope;
    }

    const source =
        audioContext.createBufferSource();

    source.buffer = buffer;

    const filter =
        audioContext.createBiquadFilter();

    filter.type = "highpass";

    filter.frequency.value =
        2500;

    const gain =
        audioContext.createGain();

    gain.gain.value =
        0.012 * intensity;

    source
        .connect(filter)
        .connect(gain)
        .connect(masterGain);

    source.start(audioNow);

    source.stop(
        audioNow + 0.12
    );
}


/* =========================================================
   GRAVITY SLIDER
========================================================= */

gravitySlider.addEventListener(
    "input",
    () => {

        GRAVITY =
            parseFloat(
                gravitySlider.value
            );

        gravityValue.textContent =
            GRAVITY.toFixed(2);
    }
);


/* =========================================================
   CANVAS
========================================================= */

function resize() {

    const dpr =
        window.devicePixelRatio || 1;

    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width =
        W * dpr;

    canvas.height =
        H * dpr;

    canvas.style.width =
        W + "px";

    canvas.style.height =
        H + "px";

    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );
}

window.addEventListener(
    "resize",
    resize
);

resize();


/* =========================================================
   DISTANCE
========================================================= */

function distance(a, b) {

    return Math.hypot(
        a.x - b.x,
        a.y - b.y
    );
}


/* =========================================================
   PARTICLE
========================================================= */

function makePoint(
    x,
    y,
    pinned = false
) {

    return {

        x,
        y,

        oldX: x,
        oldY: y,

        /*
            Screen anchors are pinned.

            Contact points are NOT pinned.
        */

        pinned
    };
}


/* =========================================================
   EDGE
========================================================= */

function isOnEdge(x, y) {

    return (
        x <= EDGE_DISTANCE ||
        y <= EDGE_DISTANCE ||
        x >= W - EDGE_DISTANCE ||
        y >= H - EDGE_DISTANCE
    );
}


function snapToEdge(x, y) {

    let sx = x;
    let sy = y;

    if (x <= EDGE_DISTANCE)
        sx = 0;

    if (x >= W - EDGE_DISTANCE)
        sx = W;

    if (y <= EDGE_DISTANCE)
        sy = 0;

    if (y >= H - EDGE_DISTANCE)
        sy = H;

    return {
        x: sx,
        y: sy
    };
}


/* =========================================================
   FIND ATTACHMENT
========================================================= */

function findAttachment(x, y) {

    let closest = null;

    let closestDistance =
        ATTACH_DISTANCE;

    for (const strand of strands) {

        const points =
            strand.points;

        for (
            let i = 0;
            i < points.length - 1;
            i++
        ) {

            const a =
                points[i];

            const b =
                points[i + 1];

            const p =
                closestPoint(
                    x,
                    y,
                    a.x,
                    a.y,
                    b.x,
                    b.y
                );

            const d =
                Math.hypot(
                    x - p.x,
                    y - p.y
                );

            if (
                d < closestDistance
            ) {

                closestDistance = d;

                closest = {

                    strand,

                    index: i,

                    x: p.x,

                    y: p.y
                };
            }
        }
    }

    return closest;
}


/* =========================================================
   CLOSEST POINT
========================================================= */

function closestPoint(
    px,
    py,
    x1,
    y1,
    x2,
    y2
) {

    const dx =
        x2 - x1;

    const dy =
        y2 - y1;

    const lenSq =
        dx * dx +
        dy * dy;

    if (lenSq === 0) {

        return {
            x: x1,
            y: y1
        };
    }

    let t =
        (
            (px - x1) * dx +
            (py - y1) * dy
        ) / lenSq;

    t = Math.max(
        0,
        Math.min(1, t)
    );

    return {

        x:
            x1 + dx * t,

        y:
            y1 + dy * t
    };
}


/* =========================================================
   CREATE MOVABLE CONTACT
========================================================= */

function createAttachmentPoint(
    attachment
) {

    const strand =
        attachment.strand;

    const points =
        strand.points;

    const index =
        attachment.index;

    /*
        This is deliberately NOT pinned.

        It can move under gravity.

        The SAME object is shared by the
        new strand.
    */

    const contact =
        makePoint(
            attachment.x,
            attachment.y,
            false
        );

    points.splice(
        index + 1,
        0,
        contact
    );

    return contact;
}


/* =========================================================
   CREATE PHYSICS STRAND
========================================================= */

function createPhysicsStrand(
    start,
    end
) {

    const d =
        distance(
            start,
            end
        );

    const count =
        Math.max(
            3,
            Math.ceil(
                d /
                SEGMENT_LENGTH
            )
        );

    const points = [];

    /*
        Shared starting point.
    */

    points.push(start);

    /*
        Interior particles.
    */

    for (
        let i = 1;
        i < count;
        i++
    ) {

        const t =
            i / count;

        points.push(
            makePoint(

                start.x +
                    (end.x - start.x) * t,

                start.y +
                    (end.y - start.y) * t,

                false
            )
        );
    }

    /*
        Shared ending point.
    */

    points.push(end);

    return {
        points
    };
}


/* =========================================================
   POINTER POSITION
========================================================= */

function getPointerPosition(e) {

    const rect =
        canvas.getBoundingClientRect();

    return {

        x:
            e.clientX -
            rect.left,

        y:
            e.clientY -
            rect.top
    };
}


/* =========================================================
   POINTER DOWN
========================================================= */

canvas.addEventListener(
    "pointerdown",
    async e => {

        await resumeAudio();

        const p =
            getPointerPosition(e);

        let start = null;

        /*
            Existing web takes priority.
        */

        const attachment =
            findAttachment(
                p.x,
                p.y
            );

        if (attachment) {

            start =
                createAttachmentPoint(
                    attachment
                );

            playAttachSound();
        }

        /*
            Otherwise screen edge.
        */

        else if (
            isOnEdge(
                p.x,
                p.y
            )
        ) {

            const edge =
                snapToEdge(
                    p.x,
                    p.y
                );

            start =
                makePoint(
                    edge.x,
                    edge.y,
                    true
                );
        }

        /*
            Can't start in empty space.
        */

        else {

            return;
        }


        currentStrand = {

            start,

            points: [
                start,
                makePoint(
                    p.x,
                    p.y
                )
            ],

            temporary: true
        };

        drawing = true;

        canvas.setPointerCapture(
            e.pointerId
        );
    }
);


/* =========================================================
   POINTER MOVE
========================================================= */

canvas.addEventListener(
    "pointermove",
    e => {

        if (!drawing)
            return;

        const p =
            getPointerPosition(e);

        const end =
            currentStrand.points[
                currentStrand.points.length - 1
            ];

        end.x = p.x;
        end.y = p.y;

        end.oldX = p.x;
        end.oldY = p.y;

        /*
            Occasional subtle silk stretching sound.
        */

        const start =
            currentStrand.start;

        const length =
            distance(
                start,
                end
            );

        const intensity =
            Math.min(
                1,
                length / 500
            );

        if (
            Math.random() < 0.025
        ) {

            playStretchSound(
                intensity
            );
        }

        draw();
    }
);


/* =========================================================
   POINTER UP
========================================================= */

canvas.addEventListener(
    "pointerup",
    e => {

        if (!drawing)
            return;

        const p =
            getPointerPosition(e);

        const start =
            currentStrand.start;

        let end = null;

        /*
            Existing web.
        */

        const attachment =
            findAttachment(
                p.x,
                p.y
            );

        if (attachment) {

            end =
                createAttachmentPoint(
                    attachment
                );

            playAttachSound();
        }

        /*
            Screen edge.
        */

        else if (
            isOnEdge(
                p.x,
                p.y
            )
        ) {

            const edge =
                snapToEdge(
                    p.x,
                    p.y
                );

            end =
                makePoint(
                    edge.x,
                    edge.y,
                    true
                );

            playAttachSound();
        }


        /*
            Invalid endpoint.
        */

        if (!end) {

            currentStrand = null;

            drawing = false;

            draw();

            return;
        }


        /*
            Create the physical strand
            using the SAME endpoint objects.
        */

        const strand =
            createPhysicsStrand(
                start,
                end
            );

        strands.push(strand);

        currentStrand = null;

        drawing = false;

        draw();
    }
);


/* =========================================================
   PHYSICS
========================================================= */

function simulateStrand(strand) {

    const points =
        strand.points;


    /*
        Verlet integration.
    */

    for (const p of points) {

        if (p.pinned)
            continue;

        const vx =
            (p.x - p.oldX) *
            DAMPING;

        const vy =
            (p.y - p.oldY) *
            DAMPING;

        p.oldX = p.x;
        p.oldY = p.y;

        p.x += vx;

        p.y += vy;

        p.y += GRAVITY;
    }


    /*
        Constraint solver.
    */

    for (
        let iteration = 0;
        iteration < ITERATIONS;
        iteration++
    ) {

        for (
            let i = 0;
            i < points.length - 1;
            i++
        ) {

            const a =
                points[i];

            const b =
                points[i + 1];

            const dx =
                b.x - a.x;

            const dy =
                b.y - a.y;

            const d =
                Math.hypot(
                    dx,
                    dy
                );

            if (d === 0)
                continue;

            const difference =
                (
                    d -
                    SEGMENT_LENGTH
                ) / d;

            const offsetX =
                dx *
                difference *
                0.5;

            const offsetY =
                dy *
                difference *
                0.5;


            if (!a.pinned) {

                a.x += offsetX;
                a.y += offsetY;
            }


            if (!b.pinned) {

                b.x -= offsetX;
                b.y -= offsetY;
            }
        }
    }


    /*
        Calculate movement intensity.

        This is used only to occasionally
        produce a very subtle silk-rustling
        sound.
    */

    let movement = 0;

    for (const p of points) {

        movement +=
            Math.abs(
                p.x - p.oldX
            ) +
            Math.abs(
                p.y - p.oldY
            );
    }

    movement /=
        points.length;

    if (
        movement > 0.3 &&
        movement < 8 &&
        Math.random() < 0.015
    ) {

        playWebRustle(
            Math.min(
                1,
                movement / 4
            )
        );
    }
}


/* =========================================================
   DRAW STRAND
========================================================= */

function drawStrand(strand) {

    const points =
        strand.points;

    if (points.length < 2)
        return;


    /*
        Soft glow.
    */

    ctx.beginPath();

    ctx.moveTo(
        points[0].x,
        points[0].y
    );

    for (
        let i = 1;
        i < points.length;
        i++
    ) {

        ctx.lineTo(
            points[i].x,
            points[i].y
        );
    }

    ctx.strokeStyle =
        "rgba(180,200,255,0.07)";

    ctx.lineWidth = 5;

    ctx.stroke();


    /*
        Main silk.
    */

    ctx.beginPath();

    ctx.moveTo(
        points[0].x,
        points[0].y
    );

    for (
        let i = 1;
        i < points.length;
        i++
    ) {

        ctx.lineTo(
            points[i].x,
            points[i].y
        );
    }

    ctx.strokeStyle =
        "rgba(225,230,240,0.88)";

    ctx.lineWidth =
        STRAND_WIDTH;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.stroke();
}


/* =========================================================
   TEMPORARY STRAND
========================================================= */

function drawTemporaryStrand() {

    if (!currentStrand)
        return;

    const points =
        currentStrand.points;

    if (points.length < 2)
        return;

    ctx.beginPath();

    ctx.moveTo(
        points[0].x,
        points[0].y
    );

    ctx.lineTo(
        points[1].x,
        points[1].y
    );

    ctx.strokeStyle =
        "rgba(200,215,255,0.5)";

    ctx.lineWidth = 1.2;

    ctx.setLineDash([
        5,
        5
    ]);

    ctx.stroke();

    ctx.setLineDash([]);
}


/* =========================================================
   DRAW
========================================================= */

function draw() {

    ctx.clearRect(
        0,
        0,
        W,
        H
    );

    ctx.fillStyle =
        "#05070a";

    ctx.fillRect(
        0,
        0,
        W,
        H
    );


    for (const strand of strands) {

        simulateStrand(strand);

        drawStrand(strand);
    }


    drawTemporaryStrand();
}


/* =========================================================
   ANIMATION
========================================================= */

function animate() {

    draw();

    requestAnimationFrame(
        animate
    );
}

animate();


/* =========================================================
   CLEAR
========================================================= */

document
    .getElementById("clear")
    .addEventListener(
        "click",
        () => {

            strands = [];

            currentStrand = null;

            drawing = false;

            draw();
        }
    );
