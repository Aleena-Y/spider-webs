const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const gravitySlider =
    document.getElementById("gravitySlider");

const gravityValue =
    document.getElementById("gravityValue");


/* =========================================================
   GLOBAL STATE
========================================================= */

let W = window.innerWidth;
let H = window.innerHeight;

let strands = [];

/*
    ALL physics particles live here.

    A connection point is stored only ONCE in this array.
    Multiple strands can reference the same particle.
*/
let particles = [];

let drawing = false;
let currentStrand = null;

let mouse = {
    x: 0,
    y: 0
};


/* =========================================================
   PHYSICS SETTINGS
========================================================= */

const SEGMENT_LENGTH = 12;

let GRAVITY = 0.28;

const DAMPING = 0.985;

const SOLVER_ITERATIONS = 12;

const EDGE_DISTANCE = 22;

const ATTACH_DISTANCE = 18;

const STRAND_WIDTH = 1.4;


/* =========================================================
   GRAVITY SLIDER
========================================================= */

gravitySlider.addEventListener("input", () => {

    GRAVITY =
        parseFloat(
            gravitySlider.value
        );

    gravityValue.textContent =
        GRAVITY.toFixed(2);
});


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
   PARTICLE
========================================================= */

function createParticle(
    x,
    y,
    pinned = false
) {

    const particle = {

        x,
        y,

        oldX: x,
        oldY: y,

        /*
            Only screen-edge particles are pinned.

            Web-to-web connection points are NOT pinned.
        */

        pinned,

        /*
            Unique identifier makes debugging
            connections easier.
        */

        id: particles.length
    };

    particles.push(particle);

    return particle;
}


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
   EDGE DETECTION
========================================================= */

function isOnEdge(x, y) {

    return (
        x <= EDGE_DISTANCE ||
        x >= W - EDGE_DISTANCE ||
        y <= EDGE_DISTANCE ||
        y >= H - EDGE_DISTANCE
    );
}


/* =========================================================
   SNAP TO SCREEN EDGE
========================================================= */

function snapToEdge(x, y) {

    /*
        Find which edge is closest.

        This prevents an endpoint from sitting
        slightly inside/outside the screen.
    */

    const distances = {

        left: Math.abs(x),

        right: Math.abs(W - x),

        top: Math.abs(y),

        bottom: Math.abs(H - y)
    };

    let closestEdge = "left";

    for (const edge in distances) {

        if (
            distances[edge] <
            distances[closestEdge]
        ) {

            closestEdge = edge;
        }
    }


    switch (closestEdge) {

        case "left":
            return {
                x: 0,
                y: Math.max(
                    0,
                    Math.min(H, y)
                )
            };

        case "right":
            return {
                x: W,
                y: Math.max(
                    0,
                    Math.min(H, y)
                )
            };

        case "top":
            return {
                x: Math.max(
                    0,
                    Math.min(W, x)
                ),
                y: 0
            };

        case "bottom":
            return {
                x: Math.max(
                    0,
                    Math.min(W, x)
                ),
                y: H
            };
    }
}


/* =========================================================
   CLOSEST POINT ON LINE
========================================================= */

function closestPoint(
    px,
    py,
    x1,
    y1,
    x2,
    y2
) {

    const dx = x2 - x1;
    const dy = y2 - y1;

    const lengthSquared =
        dx * dx +
        dy * dy;

    if (lengthSquared === 0) {

        return {
            x: x1,
            y: y1
        };
    }

    let t =
        (
            (px - x1) * dx +
            (py - y1) * dy
        ) /
        lengthSquared;

    t = Math.max(
        0,
        Math.min(1, t)
    );

    return {

        x: x1 + dx * t,

        y: y1 + dy * t
    };
}


/* =========================================================
   FIND EXISTING WEB
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

            const a = points[i];
            const b = points[i + 1];

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

                    segmentIndex: i,

                    x: p.x,

                    y: p.y
                };
            }
        }
    }

    return closest;
}


/* =========================================================
   CREATE WEB-TO-WEB CONNECTION
========================================================= */

function attachToExistingWeb(
    attachment
) {

    const strand =
        attachment.strand;

    const points =
        strand.points;

    const index =
        attachment.segmentIndex;

    /*
        IMPORTANT:

        Create ONE movable particle.

        This particle is inserted into the
        existing strand AND returned so that
        the new strand uses the exact same
        object.
    */

    const contact =
        createParticle(
            attachment.x,
            attachment.y,
            false
        );


    /*
        Insert the contact into the old strand.

        Old:

        A ───────────── B

        New:

        A ───── ● ───── B
                ↑
             contact
    */

    points.splice(
        index + 1,
        0,
        contact
    );


    return contact;
}


/* =========================================================
   CREATE PHYSICAL STRAND
========================================================= */

function createStrand(
    start,
    end
) {

    const length =
        distance(
            start,
            end
        );

    if (length < SEGMENT_LENGTH * 1.5)
        return null;


    const count =
        Math.max(
            3,
            Math.ceil(
                length /
                SEGMENT_LENGTH
            )
        );

    const points = [];


    /*
        VERY IMPORTANT:

        Do not duplicate the start particle.

        It remains shared with the existing
        web or screen edge.
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

        const x =
            start.x +
            (end.x - start.x) * t;

        const y =
            start.y +
            (end.y - start.y) * t;

        points.push(
            createParticle(
                x,
                y,
                false
            )
        );
    }


    /*
        VERY IMPORTANT:

        Do not duplicate the endpoint either.

        This is the same object belonging to
        the target web or screen edge.
    */

    points.push(end);


    const strand = {

        points,

        /*
            Each segment remembers its
            natural length.

            This lets the web stretch a tiny
            amount without breaking.
        */

        restLengths: []
    };


    for (
        let i = 0;
        i < points.length - 1;
        i++
    ) {

        strand.restLengths.push(
            distance(
                points[i],
                points[i + 1]
            )
        );
    }


    strands.push(strand);

    return strand;
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
   START DRAWING
========================================================= */

canvas.addEventListener(
    "pointerdown",
    e => {

        const p =
            getPointerPosition(e);

        let start = null;


        /*
            FIRST:

            Look for an existing web.

            This allows a new strand to begin
            directly from another strand.
        */

        const attachment =
            findAttachment(
                p.x,
                p.y
            );


        if (attachment) {

            start =
                attachToExistingWeb(
                    attachment
                );
        }


        /*
            SECOND:

            Otherwise, allow starting from
            the screen edge.
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
                createParticle(
                    edge.x,
                    edge.y,
                    true
                );
        }


        /*
            Empty space cannot start a web.
        */

        else {

            return;
        }


        /*
            Temporary strand.

            Only two points are needed while
            the user is dragging.
        */

        currentStrand = {

            start,

            currentEnd:
                createParticle(
                    p.x,
                    p.y,
                    false
                )
        };

        drawing = true;

        canvas.setPointerCapture(
            e.pointerId
        );
    }
);


/* =========================================================
   DRAGGING
========================================================= */

canvas.addEventListener(
    "pointermove",
    e => {

        if (!drawing)
            return;

        const p =
            getPointerPosition(e);

        const end =
            currentStrand.currentEnd;

        end.x = p.x;
        end.y = p.y;

        end.oldX = p.x;
        end.oldY = p.y;

        draw();
    }
);


/* =========================================================
   FINISH STRAND
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

        /*
            Remove temporary endpoint from
            global physics particles.

            It was only used for the preview.
        */

        const temporary =
            currentStrand.currentEnd;

        particles =
            particles.filter(
                particle =>
                    particle !== temporary
            );


        let end = null;


        /* -----------------------------------------
           WEB-TO-WEB
        ----------------------------------------- */

        const attachment =
            findAttachment(
                p.x,
                p.y
            );


        if (attachment) {

            end =
                attachToExistingWeb(
                    attachment
                );
        }


        /* -----------------------------------------
           WEB-TO-SCREEN
        ----------------------------------------- */

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
                createParticle(
                    edge.x,
                    edge.y,
                    true
                );
        }


        /*
            If neither is valid,
            the strand is cancelled.
        */

        if (!end) {

            currentStrand = null;

            drawing = false;

            draw();

            return;
        }


        /*
            Create the final physical strand.

            start and end are shared particles.
        */

        createStrand(
            start,
            end
        );


        currentStrand = null;

        drawing = false;

        draw();
    }
);


/* =========================================================
   GLOBAL PHYSICS
========================================================= */

function simulatePhysics() {

    /*
        -----------------------------------------------------
        1. MOVE EVERY FREE PARTICLE
        -----------------------------------------------------
    */

    for (const p of particles) {

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

        /*
            Gravity.
        */

        p.y += GRAVITY;
    }


    /*
        -----------------------------------------------------
        2. SOLVE ALL STRAND CONSTRAINTS TOGETHER
        -----------------------------------------------------

        This is the other important change.

        Previously each strand could try to move a
        shared contact independently.

        Now EVERY strand constraint is solved in
        one global physics pass.

        Therefore:

                WEB A
        ──────────●──────────
                  │
                  │
                  │
                 WEB B

        behaves as one connected physical system.
    */

    for (
        let iteration = 0;
        iteration < SOLVER_ITERATIONS;
        iteration++
    ) {

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

                const restLength =
                    strand.restLengths[i] ||
                    SEGMENT_LENGTH;

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


                /*
                    Difference between actual
                    and desired length.
                */

                const difference =
                    (
                        d -
                        restLength
                    ) / d;


                /*
                    A little elasticity.

                    1.0 = perfectly rigid
                    0.9 = slightly elastic
                    etc.
                */

                const elasticity = 0.94;

                const offsetX =
                    dx *
                    difference *
                    0.5 *
                    elasticity;

                const offsetY =
                    dy *
                    difference *
                    0.5 *
                    elasticity;


                /*
                    Move A unless it is a
                    screen-edge anchor.
                */

                if (!a.pinned) {

                    a.x += offsetX;

                    a.y += offsetY;
                }


                /*
                    Move B unless it is a
                    screen-edge anchor.
                */

                if (!b.pinned) {

                    b.x -= offsetX;

                    b.y -= offsetY;
                }
            }
        }
    }


    /*
        -----------------------------------------------------
        3. KEEP SCREEN ANCHORS ON THE SCREEN
        -----------------------------------------------------
    */

    for (const p of particles) {

        if (!p.pinned)
            continue;

        /*
            A pinned particle can only be at
            its original screen-edge location.

            We don't change its position here,
            so it remains perfectly attached.
        */
    }
}


/* =========================================================
   DRAW ONE STRAND
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
        "rgba(180,200,255,0.06)";

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
        "rgba(225,230,240,0.9)";

    ctx.lineWidth =
        STRAND_WIDTH;

    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.stroke();
}


/* =========================================================
   DRAW TEMPORARY STRAND
========================================================= */

function drawTemporaryStrand() {

    if (!currentStrand)
        return;

    const start =
        currentStrand.start;

    const end =
        currentStrand.currentEnd;


    ctx.beginPath();

    ctx.moveTo(
        start.x,
        start.y
    );

    ctx.lineTo(
        end.x,
        end.y
    );

    ctx.strokeStyle =
        "rgba(200,215,255,0.55)";

    ctx.lineWidth = 1.2;

    ctx.setLineDash([
        5,
        5
    ]);

    ctx.stroke();

    ctx.setLineDash([]);
}


/* =========================================================
   DRAW CONNECTION POINTS
========================================================= */

function drawConnectionPoints() {

    /*
        Find particles that are shared by
        multiple strands.
    */

    const usage =
        new Map();

    for (const strand of strands) {

        for (const point of strand.points) {

            usage.set(
                point,
                (usage.get(point) || 0) + 1
            );
        }
    }


    /*
        Draw only actual web-to-web
        junctions.

        Screen anchors are not highlighted.
    */

    for (const [point, count] of usage) {

        if (
            count < 2 ||
            point.pinned
        )
            continue;

        ctx.beginPath();

        ctx.arc(
            point.x,
            point.y,
            2.5,
            0,
            Math.PI * 2
        );

        ctx.fillStyle =
            "rgba(235,240,255,0.8)";

        ctx.fill();
    }
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


    /*
        Background.
    */

    ctx.fillStyle =
        "#05070a";

    ctx.fillRect(
        0,
        0,
        W,
        H
    );


    /*
        Physics first.
    */

    simulatePhysics();


    /*
        Draw all strands.
    */

    for (const strand of strands) {

        drawStrand(strand);
    }


    /*
        Current strand.
    */

    drawTemporaryStrand();


    /*
        Web-to-web contact points.
    */

    drawConnectionPoints();
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

            particles = [];

            currentStrand = null;

            drawing = false;

            draw();
        }
    );
