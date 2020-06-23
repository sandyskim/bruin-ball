# Bruin Ball

Justin Jeon, Sandy Kim, George Zhang, and Aaron Philip

## Less Obvious Features

- Field lights turn on and off and field/dirt color changes with night and day
- Various musical sounds accompany different game mechanics

## Advanced Topics

### Collisions
This game is dependent on collision. Since it is a baseball game, we must be able to detect whenever the ball collides with the bat. We used an .obj file of the bat, but placed a hidden cylinder inside to ensure that only the head of the bat would be able to collide with the ball, as the collider shape with the .obj file was not precise. We faced many issues on pushing and popping the array of bodies and had to figure out many conditional calls.

### Inertia
We also used Inertia in this game for the baseball going through the air and eventually hitting the floor. We ensured that its trajectory was natural with the Earth's gravity, making it so it falls eventually (obviously), bounces, and rolls with friction. This was used in-game and in during pre and post-game scenes.

## Team Contributions

### George

- Baseball pitch
- Baseball swing and bear motion
- Camera following baseball
- Game timing & logic
- Text

### Justin

- Collision detection
- Sounds
- Home run algorithm
- Game physics
- Ball trajectory

### Sandy

- Models framework
- Collision detection
- Ball trajectory
- Game logic
- Sounds
- Field, environment
- Pre and post-game scenes

### Aaron

- Character models
- Baseball swing and bear motion
- Ball trajectory & game physics
- Collision detection
- Camera work
