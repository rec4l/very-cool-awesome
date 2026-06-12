export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;
export const SUBSTEPS = 8;
export const WIN_SCORE = 5;

export const PLAYER_RADIUS = 25;
export const BALL_RADIUS = 20;
export const PLAYER_SPEED = 0.015;
export const BALL_RESTITUTION = 0.8;
export const PLAYER_RESTITUTION = 0.5;
export const PLAYER_FRICTION_AIR = 0.05;
export const DIRECTION_PENALTY = 0.25; // extra velocity bleed per tick when input opposes movement
export const BALL_FRICTION_AIR = 0.005;

// arena corner bevels
export const CORNER_BEVEL = 50; // px cut from each corner — tune for feel

// shared wall thickness — every map's front/back walls and goal frame use this,
// so the dynamic goal-growth rebuild (#13) can reconstruct geometry consistently
export const WALL_THICKNESS = 20;

// dynamic goal growth (#13) — breaks stalemates by widening the goal mouth the
// longer a match goes without a score. Each interval closes GOAL_GROWTH_FRACTION
// of the remaining gap to "full side" (minus corner-bevel clearance), so growth
// is fast early and tapers as it approaches the cap. Resets on every goal scored —
// it's a tiebreaker aid for the *current* stalemate, not a permanent escalation.
export const GOAL_GROWTH_INTERVAL_TICKS = 30 * TICK_RATE; // 30s of no scoring between steps
export const GOAL_GROWTH_FRACTION       = 0.4;

// wrecking ball
export const WRECKING_BALL_RADIUS  = 12;
export const WRECKING_BALL_DENSITY = 0.004;
export const CHAIN_LENGTH          = 240;
export const CHAIN_STIFFNESS       = 0.05;
export const CHAIN_DAMPING         = 0.01;
export const LAUNCH_SPEED          = 18;
// when the ball is launched toward a nearby boundary, its launch speed is scaled
// down proportionally so it can't tunnel through the wall before collisions resolve.
// SAFE_DIST = the clearance (px) at/above which the ball launches at full speed;
// MIN_FRAC = the floor so a point-blank launch still nudges the ball out a little.
export const WB_LAUNCH_SAFE_DIST   = 140;
export const WB_LAUNCH_MIN_FRAC    = 0.25;
export const WB_RETRACT_FORCE      = 0.07;
export const WB_PLAYER_IMPACT_BOOST = 10.0; // extra knockback applied to a hit player, scaled by the wrecking ball's velocity at impact (on top of normal physics collision response — tune by feel)

// boost
export const BOOST_MAX                = 100;
export const BOOST_DRAIN_PER_TICK     = BOOST_MAX / (3 * TICK_RATE); // empties in 3s
export const BOOST_FORCE_MULTIPLIER   = 1.5;
export const BOOST_PICKUP_AMOUNT      = 50;
export const BOOST_PICKUP_RADIUS      = 30;  // collection radius
export const BOOST_PICKUP_RESPAWN_TICKS = 300; // 10s

// teleport
export const TELEPORT_RANGE           = 200;
export const TELEPORT_COOLDOWN_TICKS  = 120; // 4s per charge
export const MAX_TELEPORT_CHARGES     = 3;

// reconnect (#11) — how long a mid-match disconnect is given to recover via
// Socket.IO connection state recovery before being treated as a real departure.
export const RECONNECT_GRACE_MS = 30_000;
