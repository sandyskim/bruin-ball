import { tiny, defs } from "./resources.js";

const {
  Vec,
  Mat,
  Mat4,
  Color,
  Light,
  Shape,
  Shader,
  Material,
  Texture,
  Scene,
  Canvas_Widget,
  Code_Widget,
  Text_Widget
} = tiny;
const {
  Cube,
  Subdivision_Sphere,
  Transforms_Sandbox_Base,
  Rounded_Closed_Cone,
  Capped_Cylinder,
  Text_Line,
  Shape_From_File,
  Square
} = defs;

// Helper functions
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

const Body = (defs.Body = class Body {
  // **Body** can store and update the properties of a 3D body that incrementally
  // moves from its previous place due to velocities.  It conforms to the
  // approach outlined in the "Fix Your Timestep!" blog post by Glenn Fiedler.
  constructor(shape, material, size) {
    Object.assign(this, { shape, material, size });
  }
  emplace(
    location_matrix,
    linear_velocity,
    angular_velocity,
    spin_axis = Vec.of(0, 0, 0)
      .randomized(1)
      .normalized()
  ) {
    // emplace(): assign the body's initial values, or overwrite them.
    this.center = location_matrix.times(Vec.of(0, 0, 0, 1)).to3();
    this.rotation = Mat4.translation(this.center.times(-1)).times(
      location_matrix
    );
    this.previous = {
      center: this.center.copy(),
      rotation: this.rotation.copy()
    };
    // drawn_location gets replaced with an interpolated quantity:
    this.drawn_location = location_matrix;
    return Object.assign(this, {
      linear_velocity,
      angular_velocity,
      spin_axis
    });
  }
  advance(time_amount) {
    // advance(): Perform an integration (the simplistic Forward Euler method) to
    // advance all the linear and angular velocities one time-step forward.
    this.previous = {
      center: this.center.copy(),
      rotation: this.rotation.copy()
    };
    // Apply the velocities scaled proportionally to real time (time_amount):
    // Linear velocity first, then angular:
    this.center = this.center.plus(this.linear_velocity.times(time_amount));
    this.rotation.pre_multiply(
      Mat4.rotation(time_amount * this.angular_velocity, this.spin_axis)
    );
  }
  blend_rotation(alpha) {
    // blend_rotation(): Just naively do a linear blend of the rotations, which looks
    // ok sometimes but otherwise produces shear matrices, a wrong result.

    // TODO:  Replace this function with proper quaternion blending, and perhaps
    // store this.rotation in quaternion form instead for compactness.
    return this.rotation.map((x, i) =>
      Vec.from(this.previous.rotation[i]).mix(x, alpha)
    );
  }
  blend_state(alpha) {
    // blend_state(): Compute the final matrix we'll draw using the previous two physical
    // locations the object occupied.  We'll interpolate between these two states as
    // described at the end of the "Fix Your Timestep!" blog post.
    this.drawn_location = Mat4.translation(
      this.previous.center.mix(this.center, alpha)
    )
      .times(this.blend_rotation(alpha))
      .times(Mat4.scale(this.size));
  }
  // The following are our various functions for testing a single point,
  // p, against some analytically-known geometric volume formula
  // (within some margin of distance).
  static intersect_cube(p, margin = 0) {
    return p.every(value => value >= -1 - margin && value <= 1 + margin);
  }
  static intersect_sphere(p, margin = 0) {
    return p.dot(p) < 1 + margin;
  }
  check_if_colliding(b, collider) {
    // check_if_colliding(): Collision detection function.
    // DISCLAIMER:  The collision method shown below is not used by anyone; it's just very quick
    // to code.  Making every collision body an ellipsoid is kind of a hack, and looping
    // through a list of discrete sphere points to see if the ellipsoids intersect is *really* a
    // hack (there are perfectly good analytic expressions that can test if two ellipsoids
    // intersect without discretizing them into points).
    if (this == b) return false; // Nothing collides with itself.
    // Convert sphere b to the frame where a is a unit sphere:
    var T = this.inverse.times(b.drawn_location);

    const { intersect_test, points, leeway } = collider;
    // For each vertex in that b, shift to the coordinate frame of
    // a_inv*b.  Check if in that coordinate frame it penetrates
    // the unit sphere at the origin.  Leave some leeway.
    return points.arrays.position.some(p =>
      intersect_test(T.times(p.to4(1)).to3(), leeway)
    );
  }
});

class Final_Project extends Scene {
  constructor() {
    super();
    Object.assign(this, {
      time_accumulator: 0,
      time_scale: 1,
      t: 0,
      dt: 1 / 20,
      bodies: [],
      steps_taken: 0,
      title_balls: []
    });
    this.collider = {
      intersect_test: Body.intersect_sphere,
      points: new defs.Subdivision_Sphere(2),
      leeway: 0.7
    };

    /******************** SOUNDS ********************/

    this.sounds = {
      ballgame: new Audio("assets/ballgame.mp3"),
      crack: new Audio("assets/crack.m4a"),
      homerun: new Audio("assets/yay.mp3"),
      no_homerun: new Audio("assets/aww.mp3"),
      minecraft: new Audio("assets/minecraft.mp3"),
      maplestory: new Audio ("assets/maplestory.m4a"),
      you_win: new Audio ("assets/youwin.mp3")
    };

    /******************** SHAPES ********************/
    this.shapes = {
      box: new Cube(),
      ball_4: new Subdivision_Sphere(4),
      ball_6: new Subdivision_Sphere(6),
      grass: new Shape_From_File("assets/grass.obj"),
      text: new Text_Line(30),
      long_text: new Text_Line(100),
      bat: new Shape_From_File("assets/bat.obj"),
      rounded_cone: new Rounded_Closed_Cone(4, 10, [[0, 1], [0, 1]]),
      cylinder: new Capped_Cylinder(10, 10, [[0, 2], [0, 1]]),
      plane: new Square(),
      tree_stem: new Shape_From_File("assets/treestem.obj"),
      tree_leaves: new Shape_From_File("assets/treeleaves.obj"),
      stone_1: new Shape_From_File("assets/stone1.obj"),
      stone_2: new Shape_From_File("assets/stone2.obj"),
      stone_3: new Shape_From_File("assets/stone3.obj")
    };

    /******************** ENVIRONMENT ********************/
    const phong_shader = new defs.Phong_Shader(2);
    const texture_shader = new defs.Textured_Phong(2);
    const texture_shader_2 = new defs.Fake_Bump_Map(10);
    const texture = new defs.Textured_Phong(1);
    const phong = new defs.Phong_Shader(1);
    const bump = new defs.Fake_Bump_Map(1);

    /******************** MATERIALS ********************/

    this.materials = {
      text_image: new Material(texture, {
        texture: new Texture("assets/text.png"),
        ambient: 1,
        diffusivity: 0,
        specularity: 0
      }),
      baseball: new Material(texture_shader_2, {
        texture: new Texture("assets/baseball.jpg"),
        ambient: 1,
        diffusivity: 1,
        specularity: 0
      }),
      aluminum: new Material(texture_shader_2, {
        texture: new Texture("assets/aluminum.jpg"),
        ambient: 0.5,
        diffusivity: 1,
        specularity: 0.75
      }),
      grass: new Material(texture_shader_2, {
        ambient: 0.15,
        diffusivity: 1,
        specularity: 0,
        color: Color.of(0.333333, 0.419608, 0.184314, 1)
      }),
      wood: new Material(texture_shader_2, {
        texture: new Texture("assets/bark.png"),
        ambient: 0.5,
        diffusivity: 1,
        specularity: 0
      }),
      fence: new Material(texture_shader_2, {
        texture: new Texture("assets/fence.jpg"),
        ambient: 0.5,
        diffusivity: 1,
        specularity: 0
      }),
      base: new Material(texture_shader, {
        texture: new Texture("assets/leather.jpg"),
        ambient: 0.5,
        diffusivity: 1,
        specularity: 0.1,
        color: Color.of(0.5, 0.5, 0.5, 1)
      }),
      field: new Material(texture_shader_2, {
        texture: new Texture("assets/grass_1024x1024.jpg"),
        ambient: 0.6,
        diffusivity: 1,
        specularity: 0
      }),
      dirt: new Material(texture_shader_2, {
        texture: new Texture("assets/dirt.jpg"),
        ambient: 0.8,
        diffusivity: 1,
        specularity: 0
      }),
      sky: new Material(texture_shader_2, {
        texture: new Texture("assets/sky.png"),
        ambient: 0.75,
        diffusivity: 0,
        specularity: 0
      }),
      nightsky: new Material(texture_shader_2, {
        texture: new Texture("assets/nightsky.jpg"),
        ambient: 1,
        diffusivity: 0,
        specularity: 0
      }),
      light_skin: new Material(phong_shader, {
        ambient: 0.5,
        diffusivity: 0,
        specularity: 0,
        color: Color.of(1, 0.937255, 0.835294, 1)
      }),
      gene: new Material(texture_shader_2, {
        texture: new Texture("assets/gene.png"),
        ambient: 0.8,
        diffusivity: 0,
        specularity: 0
      }),
      fur_color: new Material(texture_shader_2, {
        texture: new Texture("assets/fur.jpg"),
        ambient: 0.5,
        diffusivity: 0.8,
        specularity: 0.1,
        color: Color.of(0.4, 0.15, 0.05, 1)
      }),
      shirt: new Material(phong_shader, {
        ambient: 0.5,
        diffusivity: 0.5,
        specularity: 1,
        color: Color.of(0, 0.8, 1, 1)
      }),
      black: new Material(phong_shader, {
        ambient: 0.5,
        diffusivity: 1,
        specularity: 0,
        color: Color.of(0, 0, 0, 1)
      }),
      lights: new Material(phong_shader, {
        ambient: 1,
        diffusivity: 1,
        specularity: 0,
        color: Color.of(0.9, 0.9, 0.9, 1)
      }),
      leaves: new Material(phong_shader, {
        ambient: 0.5,
        diffusivity: 0,
        specularity: 0,
        color: Color.of(0.419608, 0.556863, 0.137255, 1)
      }),
      stone: new Material(texture_shader_2, {
        texture: new Texture("assets/stone.jpg"),
        ambient: 0.5,
        diffusivity: 1,
        specularity: 0
      })
    };

    /******************** GAME LOGISTICS  ********************/
    this.game_state = {
      not_started: "NOT STARTED",
      started: "STARTED",
      game_over: "GAME OVER",
      game_won: "YOU WIN"
    };

    this.game_level = {
      one: "1",
      two: "2",
      three: "3",
      four: "4"
    };

    this.night_time = false;
    
    this.current_game_state = this.game_state.not_started;

    this.current_game_level = this.game_level.one;

    this.game_score = 0;

    this.game_target = 3;

    this.game_started = 0;

    this.game_over = 0;

    /******************** GAME VARIABLES ********************/

    this.throw_pitch = false;
    this.pitch_count = 10;
    this.pitch_speed = 50;
    this.pitch_xy = -2;
    this.curr_throw_time = 0;
    this.batter_x = -4;
    this.toggle_swing = false;
    this.swing_bat = false;
    this.curr_swing_time = 0;
    this.ball_hit = false;
    this.ball_bounced = false;

    this.home_run = false;
    this.pitch_time = false;
    this.pitch_timer = 0;
  }
  /******************** COLLISION HANDLING ********************/
  simulate(frame_time) {
    // simulate(): Carefully advance time according to Glenn Fiedler's
    // "Fix Your Timestep" blog post.
    // This line gives ourselves a way to trick the simulator into thinking
    // that the display framerate is running fast or slow:
    frame_time = this.time_scale * frame_time;

    // Avoid the spiral of death; limit the amount of time we will spend
    // computing during this timestep if display lags:
    this.time_accumulator += Math.min(frame_time, 0.1);
    // Repeatedly step the simulation until we're caught up with this frame:
    while (Math.abs(this.time_accumulator) >= this.dt) {
      // Single step of the simulation for all bodies:
      this.update_state(this.dt);
      for (let b of this.bodies) b.advance(this.dt);
      // Following the advice of the article, de-couple
      // our simulation time from our frame rate:
      this.t += Math.sign(frame_time) * this.dt;
      this.time_accumulator -= Math.sign(frame_time) * this.dt;
      this.steps_taken++;
    }
    // Store an interpolation factor for how close our frame fell in between
    // the two latest simulation time steps, so we can correctly blend the
    // two latest states and display the result.
    let alpha = this.time_accumulator / this.dt;
    for (let b of this.bodies) b.blend_state(alpha);
  }

  /******************** CONTROLS ********************/
  make_control_panel() {
    this.key_triggered_button("Start Game", ["x"], () => {
      this.current_game_state = this.game_state.started;
    });
    this.key_triggered_button("Restart Game", ["r"], () => {
      this.current_game_state = this.game_state.started;
      this.current_game_level = 1;
      this.game_target = 3;
      this.game_score = 0;
      this.pitch_count = 10;
      this.game_started = 0;
    });
    this.key_triggered_button("Change day/night time", ["n"], () => {
      if (this.night_time == true) {
        this.night_time = false;
      } else {
        this.night_time = true;
      }
    });
    this.key_triggered_button("Batter L", ["j"], () => {
      this.batter_x = Math.max(this.batter_x - 0.5, -6);
    });
    this.key_triggered_button("Batter R", ["l"], () => {
      this.batter_x = Math.min(this.batter_x + 0.5, -2);
    });
    this.key_triggered_button("Swing", ["i"], () => {
      if (!this.swing_bat) this.toggle_swing = true;
    });
    this.key_triggered_button("Home Run", ["8"], () => {
      //this.home_run = true; UNCOMMENT THIS LATER
      this.ball_hit = true;
    });
  }


  display(context, program_state) {
    // display():  Called once per frame of animation.  For each shape that you want to
    // appear onscreen, place a .draw() call for it inside.  Each time, pass in a
    // different matrix value to control where the shape appears.

    // Setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
    if (!context.scratchpad.controls) {
      // Add a movement controls panel to the page:
     /*
      this.children.push(
        (context.scratchpad.controls = new defs.Movement_Controls())
      );
     */
      
      
      this.children.push(
        (context.scratchpad.controls = new defs.Program_State_Viewer())
      );
    

      // Add a helper scene / child scene that allows viewing each moving body up close.
      this.children.push((this.camera_teleporter = new Camera_Teleporter()));
      

      // Define the global camera and projection matrices, which are stored in program_state.  The camera
      // matrix follows the usual format for transforms, but with opposite values (cameras exist as
      // inverted matrices).  The projection matrix follows an unusual format and determines how depth is
      // treated when projecting 3D points onto a plane.  The Mat4 functions perspective() and
      // orthographic() automatically generate valid matrices for one.  The input arguments of
      // perspective() are field of view, aspect ratio, and distances to the near plane and far plane.

      program_state.set_camera(
        Mat4.inverse(Mat4.identity().times(Mat4.translation([0, 500, 0])))
      );

      this.initial_camera_location = program_state.camera_inverse;
      program_state.projection_transform = Mat4.perspective(
        Math.PI / 4,
        context.width / context.height,
        1,
        500
      );
    }

    if (
      this.current_game_state == this.game_state.started &&
      this.game_started == 0
    ) {
      program_state.set_camera(
        Mat4.inverse(
          Mat4.identity()
            .times(Mat4.translation([0, 0, 13]))
            .times(Mat4.rotation(-0.35, Vec.of(1, 0, 0)))
            .times(Mat4.translation([0, -1.5, 0]))
            .times(Mat4.scale([1.3, 1.5, 1.1]))
        )
      );
      this.initial_camera_location = program_state.camera_inverse;
      program_state.projection_transform = Mat4.perspective(
        Math.PI / 4,
        context.width / context.height,
        1,
        2500
      );
      this.game_started++;
    }

    // Find how much time has passed in seconds; we can use
    // time as an input when calculating new transforms:
    const t = program_state.animation_time / 1000;

    // Have to reset this for each frame:
    this.camera_teleporter.cameras = [];
    this.camera_teleporter.cameras.push(
        Mat4.inverse(
          Mat4.identity()
            .times(Mat4.translation([0, 0, 13]))
            .times(Mat4.rotation(-0.35, Vec.of(1, 0, 0)))
            .times(Mat4.translation([0, -1.5, 0]))
            .times(Mat4.scale([1.3, 1.5, 1.1]))
        )
    );

    // Variables that are in scope for you to use:
    // this.shapes: Your shapes, defined above.
    // this.materials: Your materials, defined above.
    // this.lights:  Assign an array of Light objects to this to light up your scene.
    // this.lights_on:  A boolean variable that changes when the user presses a button.
    // this.camera_teleporter: A child scene that helps you see your planets up close.
    //                         For this to work, you must push their inverted matrices
    //                         into the "this.camera_teleporter.cameras" array.
    // t:  Your program's time in seconds.
    // program_state:  Information the shader needs for drawing.  Pass to draw().
    // context:  Wraps the WebGL rendering context shown onscreen.  Pass to draw().

    /**********************************
      Start coding down here!!!!
      **********************************/

    // Variable model_transform will be a local matrix value that helps us position shapes.
    // It starts over as the identity every single frame - coordinate axes at the origin.
    let model_transform = Mat4.identity()
      .times(Mat4.translation([0, 0, 0]))
      .times(Mat4.rotation(-Math.PI / 4, [0, 1, 0]))
      .times(Mat4.translation([20, 0, 20]));

    program_state.lights = [
      new Light(Vec.of(0, 0, 0, 1), Color.of(1, 1, 1, 1), 100000)
    ];

    const lights_on = this.night_time ? { ambient: 1.0 } : { ambient: 0.0 };

    /******************** START SCREEN ********************/
    if (this.current_game_state == this.game_state.not_started) {
      this.sounds.maplestory.play();
      let title_backdrop = Mat4.identity();

      title_backdrop = title_backdrop
        .times(Mat4.translation([0, 500, 0]))
        .times(Mat4.scale([50, 50, 50]));
      this.shapes.box.draw(
        context,
        program_state,
        title_backdrop,
        this.materials.sky
      );

      let title_text = Mat4.identity();

      title_text = title_text.times(Mat4.translation([-15, 510, -40]));

      this.shapes.text.set_string("Welcome to Bruin Ball!", context.context);
      this.shapes.text.draw(
        context,
        program_state,
        title_text,
        this.materials.text_image
      );

      title_text = title_text.times(Mat4.translation([4, -20, 0]));

      this.shapes.text.set_string("Press X to start.", context.context);
      this.shapes.text.draw(
        context,
        program_state,
        title_text,
        this.materials.text_image
      );

      title_text = title_text
        .times(Mat4.translation([-10, -2, 0]))
        .times(Mat4.scale([0.5, 0.5, 0.5]));

      this.shapes.long_text.set_string(
        "By: Justin Jeon, Sandy Kim, Aaron Philip, and George Zhang",
        context.context
      );
      this.shapes.long_text.draw(
        context,
        program_state,
        title_text,
        this.materials.text_image
      );

      let title_bear = Mat4.identity();

      title_bear = title_bear
        .times(Mat4.translation([0, 501.5, -15]))
        .times(Mat4.rotation(3.14, Vec.of(0, 1, 0)));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear,
        this.materials.fur_color
      );

      let title_bear_eyes = title_bear.copy();

      title_bear_eyes = title_bear_eyes
        .times(Mat4.translation([0.5, 0.25, -1]))
        .times(Mat4.scale([0.05, 0.05, 0.05]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_eyes,
        this.materials.black
      );

      title_bear_eyes = title_bear_eyes
        .times(Mat4.scale([1 / 0.05, 1 / 0.05, 1 / 0.05]))
        .times(Mat4.translation([-1, 0, 0]))
        .times(Mat4.scale([0.05, 0.05, 0.05]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_eyes,
        this.materials.black
      );

      let title_bear_body = title_bear
        .times(Mat4.translation([0, -1.5, 0]))
        .times(Mat4.scale([1.3, 1.5, 1.1]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_body,
        this.materials.shirt
      );

      let title_bear_left_ear = title_bear
        .times(Mat4.translation([-0.8, 0.8, 0]))
        .times(Mat4.scale([0.25, 0.25, 0.1]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_left_ear,
        this.materials.fur_color
      );

      let title_bear_right_ear = title_bear
        .times(Mat4.translation([0.8, 0.8, 0]))
        .times(Mat4.scale([0.25, 0.25, 0.1]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_right_ear,
        this.materials.fur_color
      );

      let title_bear_right_arm = title_bear.copy();

      title_bear_right_arm = title_bear_right_arm
        .times(Mat4.translation([1.1, -0.5, -1.1]))
        .times(Mat4.rotation(181, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(1, Vec.of(0, 0, 1)))
        .times(Mat4.rotation(-0.5, Vec.of(1, 0, 0)))
        .times(Mat4.scale([0.4, 1.3, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_right_arm,
        this.materials.fur_color
      );

      let title_bear_left_arm = title_bear.copy();

      title_bear_left_arm = title_bear_left_arm
        .times(Mat4.translation([-1, -0.5, -1.1]))
        .times(Mat4.rotation(-180, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(-1.1, Vec.of(0, 0, 1)))
        .times(Mat4.rotation(0.5, Vec.of(1, 0, 0)))
        .times(Mat4.scale([0.4, 1.3, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_left_arm,
        this.materials.fur_color
      );

      let title_bear_left_leg = title_bear
        .times(Mat4.translation([-0.7, -3, 0]))
        .times(Mat4.scale([0.4, 1, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_left_leg,
        this.materials.fur_color
      );

      let title_bear_right_leg = title_bear
        .times(Mat4.translation([0.7, -3, 0]))
        .times(Mat4.scale([0.4, 1, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_right_leg,
        this.materials.fur_color
      );

      let title_bear_nose = title_bear
        .times(Mat4.translation([0.05, 0.1, -1.2]))
        .times(Mat4.rotation(3, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(-0.2, Vec.of(1, 0, 0)))
        .times(Mat4.scale([0.5, 0.5, 0.45]));

      this.shapes.rounded_cone.draw(
        context,
        program_state,
        title_bear_nose,
        this.materials.fur_color
      );

      let title_bear_nose_tip = title_bear
        .times(Mat4.translation([0, 0, -1.5]))
        .times(Mat4.scale([0.15, 0.15, 0.15]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_nose_tip,
        this.materials.black
      );

      let frame_time = this.time_scale * program_state.animation_delta_time;

      this.time_accumulator += Math.min(frame_time, 0.1);

      while (Math.abs(this.time_accumulator) >= this.dt) {
        while (this.title_balls.length < 15) {
          this.title_balls.push(
            new Body(
              this.shapes.ball_4,
              this.materials.baseball,
              Vec.of(1, 1 + Math.random(), 1)
            ).emplace(
              Mat4.translation(Vec.of(0, 530, -20).randomized(10)),
              Vec.of(0, -1, 0)
                .randomized(2)
                .normalized()
                .times(3),
              Math.random()
            )
          );
        }

        for (let b of this.title_balls) {
          b.linear_velocity[1] += (1 / 20) * -9.8;
          if (b.center[1] < 480 && b.linear_velocity[1] < 0)
            b.linear_velocity[1] *= -0.8;
        }

        this.title_balls = this.title_balls.filter(
          b => b.center.norm() < 530 && b.linear_velocity.norm() > 2
        );
        for (let b of this.title_balls) b.advance(this.dt);
        this.t += Math.sign(frame_time) * this.dt;
        this.time_accumulator -= Math.sign(frame_time) * this.dt;
        this.steps_taken++;
      }
      let alpha = this.time_accumulator / this.dt;
      for (let b of this.title_balls) b.blend_state(alpha);
      for (let b of this.title_balls)
        b.shape.draw(context, program_state, b.drawn_location, b.material);
    }

    /****************** GAME OVER ******************/
    if (this.current_game_state == this.game_state.game_over) {
      this.sounds.minecraft.play();
      program_state.set_camera(
        Mat4.inverse(Mat4.identity().times(Mat4.translation([0, 500, 0])))
      );

      this.initial_camera_location = program_state.camera_inverse;
      program_state.projection_transform = Mat4.perspective(
        Math.PI / 4,
        context.width / context.height,
        1,
        500
      );

      let title_backdrop = Mat4.identity();

      title_backdrop = title_backdrop
        .times(Mat4.translation([0, 500, 0]))
        .times(Mat4.scale([50, 50, 50]));
      this.shapes.box.draw(
        context,
        program_state,
        title_backdrop,
        this.materials.nightsky
      );

      let title_text = Mat4.identity();

      title_text = title_text.times(Mat4.translation([-6, 510, -40]));

      this.shapes.text.set_string("You Lose.", context.context);
      this.shapes.text.draw(
        context,
        program_state,
        title_text,
        this.materials.text_image
      );

      title_text = title_text.times(Mat4.translation([-7, -20, 0]));

      this.shapes.text.set_string("Press R to restart.", context.context);
      this.shapes.text.draw(
        context,
        program_state,
        title_text,
        this.materials.text_image
      );

      let title_bear = Mat4.identity();

      title_bear = title_bear
        .times(Mat4.translation([0, 501.5, -15]))
        .times(Mat4.rotation(3.14, Vec.of(0, 1, 0)));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear,
        this.materials.fur_color
      );

      let title_bear_eyes = title_bear.copy();

      title_bear_eyes = title_bear_eyes
        .times(Mat4.translation([0.5, 0.25, -1]))
        .times(Mat4.scale([0.05, 0.05, 0.05]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_eyes,
        this.materials.black
      );

      title_bear_eyes = title_bear_eyes
        .times(Mat4.scale([1 / 0.05, 1 / 0.05, 1 / 0.05]))
        .times(Mat4.translation([-1, 0, 0]))
        .times(Mat4.scale([0.05, 0.05, 0.05]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_eyes,
        this.materials.black
      );

      let title_bear_body = title_bear
        .times(Mat4.translation([0, -1.5, 0]))
        .times(Mat4.scale([1.3, 1.5, 1.1]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_body,
        this.materials.shirt
      );

      let title_bear_left_ear = title_bear
        .times(Mat4.translation([-0.8, 0.8, 0]))
        .times(Mat4.scale([0.25, 0.25, 0.1]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_left_ear,
        this.materials.fur_color
      );

      let title_bear_right_ear = title_bear
        .times(Mat4.translation([0.8, 0.8, 0]))
        .times(Mat4.scale([0.25, 0.25, 0.1]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_right_ear,
        this.materials.fur_color
      );

      let title_bear_right_arm = title_bear.copy();

      title_bear_right_arm = title_bear_right_arm
        .times(Mat4.translation([1.1, -1.1, -1.1]))
        .times(Mat4.scale([0.4, 0.7, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_right_arm,
        this.materials.fur_color
      );

      let title_bear_left_arm = title_bear.copy();

      title_bear_left_arm = title_bear_left_arm
        .times(Mat4.translation([-1, -1.1, -1.1]))
        .times(Mat4.rotation(-180, Vec.of(0, 1, 0)))
        .times(Mat4.scale([0.4, 0.7, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_left_arm,
        this.materials.fur_color
      );

      let title_bear_left_leg = title_bear
        .times(Mat4.translation([-0.7, -3, 0]))
        .times(Mat4.scale([0.4, 1, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_left_leg,
        this.materials.fur_color
      );

      let title_bear_right_leg = title_bear
        .times(Mat4.translation([0.7, -3, 0]))
        .times(Mat4.scale([0.4, 1, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_right_leg,
        this.materials.fur_color
      );

      let title_bear_nose = title_bear
        .times(Mat4.translation([0.05, 0.1, -1.2]))
        .times(Mat4.rotation(3, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(-0.2, Vec.of(1, 0, 0)))
        .times(Mat4.scale([0.5, 0.5, 0.45]));

      this.shapes.rounded_cone.draw(
        context,
        program_state,
        title_bear_nose,
        this.materials.fur_color
      );

      let title_bear_nose_tip = title_bear
        .times(Mat4.translation([0, 0, -1.5]))
        .times(Mat4.scale([0.15, 0.15, 0.15]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_nose_tip,
        this.materials.black
      );
    }

    /******************** WIN SCREEN ********************/
    if (this.current_game_state == this.game_state.game_won) {
      this.sounds.you_win.play();
      program_state.set_camera(
        Mat4.inverse(Mat4.identity().times(Mat4.translation([0, 500, 0])))
      );

      this.initial_camera_location = program_state.camera_inverse;
      program_state.projection_transform = Mat4.perspective(
        Math.PI / 4,
        context.width / context.height,
        1,
        500
      );
      let title_backdrop = Mat4.identity();

      title_backdrop = title_backdrop
        .times(Mat4.translation([0, 500, 0]))
        .times(Mat4.scale([50, 50, 50]));
      this.shapes.box.draw(
        context,
        program_state,
        title_backdrop,
        this.materials.sky
      );

      let title_text = Mat4.identity();

      title_text = title_text.times(Mat4.translation([-5, 510, -40]));

      this.shapes.text.set_string("You won!", context.context);
      this.shapes.text.draw(
        context,
        program_state,
        title_text,
        this.materials.text_image
      );

      title_text = title_text.times(Mat4.translation([-6, -20, 0]));

      this.shapes.text.set_string("Press R to restart.", context.context);
      this.shapes.text.draw(
        context,
        program_state,
        title_text,
        this.materials.text_image
      );

      let title_bear = Mat4.identity();

      title_bear = title_bear
        .times(Mat4.translation([0, 501.5, -15]))
        .times(Mat4.rotation(3.14, Vec.of(0, 1, 0)));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear,
        this.materials.fur_color
      );

      let title_bear_eyes = title_bear.copy();

      title_bear_eyes = title_bear_eyes
        .times(Mat4.translation([0.5, 0.25, -1]))
        .times(Mat4.scale([0.05, 0.05, 0.05]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_eyes,
        this.materials.black
      );

      title_bear_eyes = title_bear_eyes
        .times(Mat4.scale([1 / 0.05, 1 / 0.05, 1 / 0.05]))
        .times(Mat4.translation([-1, 0, 0]))
        .times(Mat4.scale([0.05, 0.05, 0.05]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_eyes,
        this.materials.black
      );

      let title_bear_body = title_bear
        .times(Mat4.translation([0, -1.5, 0]))
        .times(Mat4.scale([1.3, 1.5, 1.1]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_body,
        this.materials.shirt
      );

      let title_bear_left_ear = title_bear
        .times(Mat4.translation([-0.8, 0.8, 0]))
        .times(Mat4.scale([0.25, 0.25, 0.1]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_left_ear,
        this.materials.fur_color
      );

      let title_bear_right_ear = title_bear
        .times(Mat4.translation([0.8, 0.8, 0]))
        .times(Mat4.scale([0.25, 0.25, 0.1]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_right_ear,
        this.materials.fur_color
      );

      let title_bear_right_arm = title_bear.copy();

      title_bear_right_arm = title_bear_right_arm
        .times(Mat4.translation([1.1, -0.5, -1.1]))
        .times(Mat4.rotation(181, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(1, Vec.of(0, 0, 1)))
        .times(Mat4.rotation(-0.5, Vec.of(1, 0, 0)))
        .times(Mat4.scale([0.4, 1.3, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_right_arm,
        this.materials.fur_color
      );

      let title_bear_left_arm = title_bear.copy();

      title_bear_left_arm = title_bear_left_arm
        .times(Mat4.translation([-1, -0.5, -1.1]))
        .times(Mat4.rotation(-180, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(-1.1, Vec.of(0, 0, 1)))
        .times(Mat4.rotation(0.5, Vec.of(1, 0, 0)))
        .times(Mat4.scale([0.4, 1.3, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_left_arm,
        this.materials.fur_color
      );

      let title_bear_left_leg = title_bear
        .times(Mat4.translation([-0.7, -3, 0]))
        .times(Mat4.scale([0.4, 1, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_left_leg,
        this.materials.fur_color
      );

      let title_bear_right_leg = title_bear
        .times(Mat4.translation([0.7, -3, 0]))
        .times(Mat4.scale([0.4, 1, 0.4]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_right_leg,
        this.materials.fur_color
      );

      let title_bear_nose = title_bear
        .times(Mat4.translation([0.05, 0.1, -1.2]))
        .times(Mat4.rotation(3, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(-0.2, Vec.of(1, 0, 0)))
        .times(Mat4.scale([0.5, 0.5, 0.45]));

      this.shapes.rounded_cone.draw(
        context,
        program_state,
        title_bear_nose,
        this.materials.fur_color
      );

      let title_bear_nose_tip = title_bear
        .times(Mat4.translation([0, 0, -1.5]))
        .times(Mat4.scale([0.15, 0.15, 0.15]));

      this.shapes.ball_6.draw(
        context,
        program_state,
        title_bear_nose_tip,
        this.materials.black
      );

      let frame_time = this.time_scale * program_state.animation_delta_time;

      this.time_accumulator += Math.min(frame_time, 0.1);

      while (Math.abs(this.time_accumulator) >= this.dt) {
        while (this.title_balls.length < 15) {
          this.title_balls.push(
            new Body(
              this.shapes.ball_4,
              this.materials.baseball,
              Vec.of(1, 1 + Math.random(), 1)
            ).emplace(
              Mat4.translation(Vec.of(0, 530, -20).randomized(10)),
              Vec.of(0, -1, 0)
                .randomized(2)
                .normalized()
                .times(3),
              Math.random()
            )
          );
        }

        for (let b of this.title_balls) {
          b.linear_velocity[1] += (1 / 20) * -9.8;
          if (b.center[1] < 480 && b.linear_velocity[1] < 0)
            b.linear_velocity[1] *= -0.8;
        }

        this.title_balls = this.title_balls.filter(
          b => b.center.norm() < 530 && b.linear_velocity.norm() > 2
        );
        for (let b of this.title_balls) b.advance(this.dt);
        this.t += Math.sign(frame_time) * this.dt;
        this.time_accumulator -= Math.sign(frame_time) * this.dt;
        this.steps_taken++;
      }
      let alpha = this.time_accumulator / this.dt;
      for (let b of this.title_balls) b.blend_state(alpha);
      for (let b of this.title_balls)
        b.shape.draw(context, program_state, b.drawn_location, b.material);
    }

   /***************** DISABLE STUFF PRIOR TO GAME BEGINNING *****************/
    if (this.current_game_state == this.game_state.started) {
      while (this.title_balls != 0) {
        for (let b of this.title_balls) this.title_balls.pop();
      }
      this.sounds.maplestory.pause();
      this.sounds.minecraft.pause();
      this.sounds.you_win.pause();

    }
    /******************** GAME STATE + TEXT ********************/
    if (
      this.current_game_level == this.game_level.one &&
      this.game_score < 3 &&
      this.pitch_count == -1 
    ) {
      this.current_game_state = this.game_state.game_over;
    }
    if (
      this.current_game_level == this.game_level.two &&
      this.game_score < 5 &&
      this.pitch_count == -1
    ) {
      this.current_game_state = this.game_state.game_over;
    }
    if (
      this.current_game_level == this.game_level.three &&
      this.game_score < 7 &&
      this.pitch_count == -1
    ) {
      this.current_game_state = this.game_state.game_over;
    }
    if (
      this.current_game_level == this.game_level.four &&
      this.game_score < 10 &&
      this.pitch_count == -1
    ) {
      this.current_game_state = this.game_state.game_over;
    }

    if (
      this.current_game_level == this.game_level.one &&
      this.game_score >= 3 &&
      this.pitch_count == -1
    ) {
      this.current_game_level = this.game_level.two;
      this.game_score = 0;
      this.pitch_count = 10;
    }
    if (
      this.current_game_level == this.game_level.two &&
      this.game_score >= 5 &&
      this.pitch_count == -1
    ) {
      /*this.current_game_level = this.game_level.three;
      this.game_score = 0;
      this.pitch_count = 10;*/
      this.current_game_state = this.game_state.game_won;
    }
    if (
      this.current_game_level == this.game_level.three &&
      this.game_score >= 7 &&
      this.pitch_count == 0
    ) {
      this.current_game_level = this.game_level.four;
      this.game_score = 0;
      this.pitch_count = 10;
    }
    if (
      this.current_game_level == this.game_level.four &&
      this.game_score >= 10 &&
      this.pitch_count == -1
    ) {
      this.current_game_state = this.game_state.game_won;
    }

    let pitches = Mat4.identity();

    pitches = pitches
      .times(Mat4.translation([-5, -2, -10]))
      .times(Mat4.scale([0.5, 0.5, 0.5]))
      .times(Mat4.rotation(-0.1, [1, 0, 0]));
    const pitch_plural = " Pitches Left!";
    const pitch_singular = " Pitch Left!";
    if (this.pitch_count == 1) {
      this.shapes.text.set_string(
        this.pitch_count + pitch_singular,
        context.context
      );
    } else {
      if (this.pitch_count == -1) this.shapes.text.set_string(
        "0" + pitch_plural,
        context.context)
      else this.shapes.text.set_string(
        this.pitch_count + pitch_plural,
        context.context
      );
    }
    this.shapes.text.draw(
      context,
      program_state,
      pitches,
      this.materials.text_image
    );

    let level = Mat4.identity();

    level = level
      .times(Mat4.translation([4.70, -7, 5]))
      .times(Mat4.scale([0.25, 0.25, 0.25]))
      .times(Mat4.rotation(-0.4, [1, 0, 0]));

    this.shapes.text.set_string(
      "Level: " + this.current_game_level,
      context.context
    );
    this.shapes.text.draw(
      context,
      program_state,
      level,
      this.materials.text_image
    );

    let homeruns = Mat4.identity();

    homeruns = homeruns
      .times(Mat4.translation([3, -9, 5]))
      .times(Mat4.scale([0.25, 0.25, 0.25]))
      .times(Mat4.rotation(-0.4, [1, 0, 0]));

    this.shapes.text.set_string(
      "Home Run(s): " + this.game_score,
      context.context
    );
    this.shapes.text.draw(
      context,
      program_state,
      homeruns,
      this.materials.text_image
    );

    let target = Mat4.identity();

    target = target
      .times(Mat4.translation([4.6, -8, 5]))
      .times(Mat4.scale([0.25, 0.25, 0.25]))
      .times(Mat4.rotation(-0.4, [1, 0, 0]));

    if (this.current_game_level == 2) this.game_target = 5;
    if (this.current_game_level == 3) this.game_target = 7;
    if (this.current_game_level == 4) this.game_target = 10;
    if (this.current_game_level == 5) this.game_target = 13;

    this.shapes.text.set_string("Target: " + this.game_target, context.context);

    this.shapes.text.draw(
      context,
      program_state,
      target,
      this.materials.text_image
    );
    /******************** ENVIRONMENT ********************/

    let sky = model_transform.copy();

    sky = sky
      .times(Mat4.translation([-230, 164, -225]))
      .times(Mat4.scale([250, 175, 250]));
    if (this.night_time == true) {
      this.shapes.box.draw(
        context,
        program_state,
        sky,
        this.materials.nightsky
      );
    } else {
      this.shapes.box.draw(context, program_state, sky, this.materials.sky);
    }

    /******************** GREENERY ********************/

    let tree = Mat4.identity();

    tree = tree
      .times(Mat4.translation([-90, 21, -90]))
      .times(Mat4.scale([10, 10, 10]));

    this.shapes.tree_stem.draw(
      context,
      program_state,
      tree,
      this.materials.wood
    );

    this.shapes.tree_leaves.draw(
      context,
      program_state,
      tree,
      this.materials.leaves
    );

    tree = tree.times(Mat4.translation([5, 0, -5]));

    this.shapes.tree_stem.draw(
      context,
      program_state,
      tree,
      this.materials.wood
    );

    this.shapes.tree_leaves.draw(
      context,
      program_state,
      tree,
      this.materials.leaves
    );

    tree = tree.times(Mat4.translation([10, 0, -5]));

    this.shapes.tree_stem.draw(
      context,
      program_state,
      tree,
      this.materials.wood
    );

    this.shapes.tree_leaves.draw(
      context,
      program_state,
      tree,
      this.materials.leaves
    );

    tree = tree.times(Mat4.translation([-15, 0, 5]));

    this.shapes.tree_stem.draw(
      context,
      program_state,
      tree,
      this.materials.wood
    );

    this.shapes.tree_leaves.draw(
      context,
      program_state,
      tree,
      this.materials.leaves
    );

    tree = tree.times(Mat4.translation([9, 0, -4]));

    this.shapes.tree_stem.draw(
      context,
      program_state,
      tree,
      this.materials.wood
    );

    this.shapes.tree_leaves.draw(
      context,
      program_state,
      tree,
      this.materials.leaves
    );

    tree = tree.times(Mat4.translation([7, 0, 7]));

    this.shapes.tree_stem.draw(
      context,
      program_state,
      tree,
      this.materials.wood
    );

    this.shapes.tree_leaves.draw(
      context,
      program_state,
      tree,
      this.materials.leaves
    );

    tree = tree.times(Mat4.translation([5, 0, 1]));

    this.shapes.tree_stem.draw(
      context,
      program_state,
      tree,
      this.materials.wood
    );

    this.shapes.tree_leaves.draw(
      context,
      program_state,
      tree,
      this.materials.leaves
    );

    let stone = Mat4.identity();

    stone = stone
      .times(Mat4.translation([-60, 0, -120]))
      .times(Mat4.scale([7, 7, 7]));

    this.shapes.stone_1.draw(
      context,
      program_state,
      stone,
      this.materials.stone
    );

    stone = stone.times(Mat4.translation([5, 0, -9]));

    this.shapes.stone_2.draw(
      context,
      program_state,
      stone,
      this.materials.stone
    );

    stone = stone.times(Mat4.translation([10, 0, 5]));

    this.shapes.stone_3.draw(
      context,
      program_state,
      stone,
      this.materials.stone
    );

    stone = stone.times(Mat4.translation([10, 0, 2]));

    this.shapes.stone_3.draw(
      context,
      program_state,
      stone,
      this.materials.stone
    );

    let grass = Mat4.identity();

    grass = grass
      .times(Mat4.translation(Vec.of(-50, -3, -230)))
      .times(Mat4.scale([5, 5, 5]));

    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 5; j++) {
        let grass_piece = grass.times(Mat4.translation([+i * 3, 0, +j * 4]));

        this.shapes.grass.draw(
          context,
          program_state,
          grass_piece,
          this.materials.grass
        );
      }
    }

    grass = grass
      .times(Mat4.rotation(0.785398, Vec.of(0, 1, 0)))
      .times(Mat4.translation(Vec.of(-30, 0, 1)));

    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 5; j++) {
        let grass_piece = grass.times(Mat4.translation([+i * 3, 0, +j * 4]));

        this.shapes.grass.draw(
          context,
          program_state,
          grass_piece,
          this.materials.grass
        );
      }
    }

    grass = grass
      .times(Mat4.rotation(2 * 0.785398, Vec.of(0, 1, 0)))
      .times(Mat4.translation(Vec.of(-44, 0, 28)));

    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 5; j++) {
        let grass_piece = grass.times(Mat4.translation([+i * 3, 0, +j * 4]));

        this.shapes.grass.draw(
          context,
          program_state,
          grass_piece,
          this.materials.grass
        );
      }
    }
    /******************** FIELD ********************/

    let field = model_transform
      .copy()
      .times(Mat4.rotation(1.5708, Vec.of(1, 0, 0)))
      .times(Mat4.translation([-430, -450, 35]))
      .times(Mat4.scale([25, 25, 25]))
      .times(Mat4.translation([-1, 0, -1]));

    for (let i = 0; i < 19; i++) {
      for (let j = 0; j < 19; j++) {
        let field_piece = field.times(Mat4.translation([+i, +j, 0]));

        if (this.night_time) {
          this.shapes.plane.draw(
            context,
            program_state,
            field_piece,
            this.materials.field.override({ ambient: 0.4 })
          );
        } else {
          this.shapes.plane.draw(
            context,
            program_state,
            field_piece,
            this.materials.field
          );
        }
      }
    }

    /******************** FENCE ********************/

    let fence = model_transform.copy();

    fence = fence
      .times(Mat4.translation([-125, -7, -127]))
      .times(Mat4.scale([0.1, 3, 1]));

    for (let total = 1; total < 60; total++) {
      fence = fence.times(Mat4.translation([0, 0, 2.1]));

      this.shapes.box.draw(context, program_state, fence, this.materials.fence);
    }

    fence = model_transform.copy();

    fence = fence
      .times(Mat4.translation([-126, -7, -126]))
      .times(Mat4.scale([1, 3, 0.1]));

    for (let total = 1; total < 60; total++) {
      fence = fence.times(Mat4.translation([2.1, 0, 0]));

      this.shapes.box.draw(context, program_state, fence, this.materials.fence);
    }

    /******************** LIGHTS ********************/

    let right_light_pole = model_transform.copy();
    right_light_pole = right_light_pole
      .times(Mat4.translation([35, 2.5, -130]))
      .times(Mat4.rotation(1.5708, Vec.of(1, 0, 0)))
      .times(Mat4.scale([0.5, 0.5, 25]));

    for (let total = 1; total < 3; total++) {
      right_light_pole = right_light_pole.times(Mat4.translation([-130, 0, 0]));
      this.shapes.cylinder.draw(
        context,
        program_state,
        right_light_pole,
        this.materials.aluminum
      );
      let right_light_pole_2 = right_light_pole.copy();
      right_light_pole_2 = right_light_pole_2
        .times(Mat4.scale([2, 2, 1 / 25]))
        .times(Mat4.translation([0, 0, -16]))
        .times(Mat4.rotation(1.5708, Vec.of(0, 1, 0)))
        .times(Mat4.scale([0.5, 0.5, 15]));

      for (let total_2 = 1; total_2 < 4; total_2++) {
        right_light_pole_2 = right_light_pole_2.times(
          Mat4.translation([-6, 0, 0])
        );
        this.shapes.cylinder.draw(
          context,
          program_state,
          right_light_pole_2,
          this.materials.aluminum
        );
        for (let total_3 = 1; total_3 < 4; total_3++) {
          let right_light = right_light_pole_2.copy();
          if (this.night_time == true) {
            right_light = right_light
              .times(Mat4.scale([2, 2, 1 / 15]))
              .times(Mat4.translation([0, 1, -5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              right_light,
              this.materials.lights
            );
            right_light = right_light.times(Mat4.translation([0, 0, 5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              right_light,
              this.materials.lights
            );
            right_light = right_light.times(Mat4.translation([0, 0, 5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              right_light,
              this.materials.lights
            );
          } else {
            right_light = right_light
              .times(Mat4.scale([2, 2, 1 / 15]))
              .times(Mat4.translation([0, 1, -5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              right_light,
              this.materials.lights.override(lights_on)
            );
            right_light = right_light.times(Mat4.translation([0, 0, 5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              right_light,
              this.materials.lights.override(lights_on)
            );
            right_light = right_light.times(Mat4.translation([0, 0, 5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              right_light,
              this.materials.lights.override(lights_on)
            );
          }
        }
      }
    }

    let left_light_pole = model_transform.copy();
    left_light_pole = left_light_pole
      .times(Mat4.translation([-130, 2.5, 35]))
      .times(Mat4.rotation(1.5708, Vec.of(1, 0, 0)))
      .times(Mat4.rotation(-1.5708, Vec.of(0, 0, 1)))
      .times(Mat4.scale([0.5, 0.5, 25]));

    for (let total = 1; total < 3; total++) {
      left_light_pole = left_light_pole.times(Mat4.translation([130, 0, 0]));
      this.shapes.cylinder.draw(
        context,
        program_state,
        left_light_pole,
        this.materials.aluminum
      );
      let left_light_pole_2 = left_light_pole.copy();
      left_light_pole_2 = left_light_pole_2
        .times(Mat4.scale([2, 2, 1 / 25]))
        .times(Mat4.translation([0, 0, -16]))
        .times(Mat4.rotation(1.5708, Vec.of(0, 1, 0)))
        .times(Mat4.scale([0.5, 0.5, 15]));

      for (let total_2 = 1; total_2 < 4; total_2++) {
        left_light_pole_2 = left_light_pole_2.times(
          Mat4.translation([-6, 0, 0])
        );
        this.shapes.cylinder.draw(
          context,
          program_state,
          left_light_pole_2,
          this.materials.aluminum
        );
        for (let total_3 = 1; total_3 < 4; total_3++) {
          let left_light = left_light_pole_2.copy();
          if (this.night_time == true) {
            left_light = left_light
              .times(Mat4.scale([2, 2, 1 / 15]))
              .times(Mat4.translation([0, 1, -5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              left_light,
              this.materials.lights
            );
            left_light = left_light.times(Mat4.translation([0, 0, 5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              left_light,
              this.materials.lights
            );
            left_light = left_light.times(Mat4.translation([0, 0, 5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              left_light,
              this.materials.lights
            );
          } else {
            left_light = left_light
              .times(Mat4.scale([2, 2, 1 / 15]))
              .times(Mat4.translation([0, 1, -5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              left_light,
              this.materials.lights.override(lights_on)
            );
            left_light = left_light.times(Mat4.translation([0, 0, 5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              left_light,
              this.materials.lights.override(lights_on)
            );
            left_light = left_light.times(Mat4.translation([0, 0, 5]));
            this.shapes.ball_4.draw(
              context,
              program_state,
              left_light,
              this.materials.lights.override(lights_on)
            );
          }
        }
      }
    }

    /******************** BASES AND DIRT ********************/
    const dirt_mod = this.night_time ? {ambient: 0.6} : {ambient: 0.8};

    let home_dirt = model_transform.copy();

    home_dirt = home_dirt
      .times(Mat4.scale([0.75, 0.5, 0.75]))
      .times(Mat4.translation([-25, -20, -25]))
      .times(Mat4.scale([6, 1, 6]));

    this.shapes.ball_4.draw(
      context,
      program_state,
      home_dirt,
      this.materials.dirt.override(dirt_mod)
    );

    let home_base = home_dirt.copy();

    home_base = home_base
      .times(Mat4.translation([0, 0.5, 0]))
      .times(Mat4.scale([1 / 3, 1, 1 / 3]));

    this.shapes.box.draw(
      context,
      program_state,
      home_base,
      this.materials.base
    );

    let mound = home_dirt.copy();

    mound = mound
      .times(Mat4.translation([-4.5, 0, -4.5]))
      .times(Mat4.scale([1, 3, 1]));

    this.shapes.ball_4.draw(context, program_state, mound, this.materials.dirt.override(dirt_mod));

    let base1_dirt = home_dirt.copy();

    base1_dirt = base1_dirt.times(Mat4.translation([0, 0, -9]));

    this.shapes.ball_4.draw(
      context,
      program_state,
      base1_dirt,
      this.materials.dirt.override(dirt_mod)
    );

    let base1 = base1_dirt.copy();

    base1 = base1
      .times(Mat4.translation([0, 0.5, 0]))
      .times(Mat4.scale([1 / 3, 1, 1 / 3]));

    this.shapes.box.draw(context, program_state, base1, this.materials.base);

    let base2_dirt = base1_dirt.copy();

    base2_dirt = base2_dirt.times(Mat4.translation([-9, 0, 0]));

    this.shapes.ball_4.draw(
      context,
      program_state,
      base2_dirt,
      this.materials.dirt.override(dirt_mod)
    );

    let base2 = base2_dirt.copy();

    base2 = base2
      .times(Mat4.translation([0, 0.5, 0]))
      .times(Mat4.scale([1 / 3, 1, 1 / 3]));

    this.shapes.box.draw(context, program_state, base2, this.materials.base);

    let base3_dirt = base2_dirt.copy();

    base3_dirt = base3_dirt.times(Mat4.translation([0, 0, 9]));

    this.shapes.ball_4.draw(
      context,
      program_state,
      base3_dirt,
      this.materials.dirt.override(dirt_mod)
    );

    let base3 = base3_dirt.copy();

    base3 = base3
      .times(Mat4.translation([0, 0.5, 0]))
      .times(Mat4.scale([1 / 3, 1, 1 / 3]));

    this.shapes.box.draw(context, program_state, base3, this.materials.base);

    let h1_dirt = home_dirt.copy();

    h1_dirt = h1_dirt
      .times(Mat4.translation([0, -0.9, -4]))
      .times(Mat4.scale([1 / 3, 1, 4.5]));

    this.shapes.box.draw(context, program_state, h1_dirt, this.materials.dirt.override(dirt_mod));

    let onetwo_dirt = base1_dirt.copy();

    onetwo_dirt = onetwo_dirt
      .times(Mat4.translation([-4, -0, 0]))
      .times(Mat4.scale([4.5, 1, 1 / 3]));

    this.shapes.box.draw(
      context,
      program_state,
      onetwo_dirt,
      this.materials.dirt.override(dirt_mod)
    );

    let twothree_dirt = base2_dirt.copy();

    twothree_dirt = twothree_dirt
      .times(Mat4.translation([0, -0.9, 4]))
      .times(Mat4.scale([1 / 3, 1, 4.5]));

    this.shapes.box.draw(
      context,
      program_state,
      twothree_dirt,
      this.materials.dirt.override(dirt_mod)
    );

    let threeh_dirt = home_dirt.copy();

    threeh_dirt = threeh_dirt
      .times(Mat4.translation([-4, -0.9, 0]))
      .times(Mat4.scale([4.5, 1, 1 / 3]));

    this.shapes.box.draw(
      context,
      program_state,
      threeh_dirt,
      this.materials.dirt.override(dirt_mod)
    );

    /******************** PEOPLE ********************/

    /******************** pooh ********************/

    if (this.toggle_swing) {
      this.curr_swing_time = t;
      this.swing_bat = true;
      this.toggle_swing = false;
    }

    const swing_diff = t - this.curr_swing_time;

    let pooh_transform = Mat4.identity()
      .times(Mat4.translation([this.batter_x, -6, 3]))
      .times(Mat4.rotation(-1, Vec.of(0, 1, 0)));

    if (this.swing_bat)
      pooh_transform = pooh_transform.times(
        Mat4.rotation(-0.1 - 1 * Math.cos(swing_diff * 8.1), Vec.of(0, 1, 0))
      );

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_transform,
      this.materials.fur_color
    );

    let pooh_right_eye = pooh_transform
      .times(Mat4.translation([0.4, 0.65, -0.55]))
      .times(Mat4.scale([0.1, 0.1, 0.1]));

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_right_eye,
      this.materials.black
    );

    let pooh_left_eye = pooh_transform
      .times(Mat4.translation([-0.4, 0.65, -0.55]))
      .times(Mat4.scale([0.1, 0.1, 0.1]));

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_left_eye,
      this.materials.black
    );

    let pooh_body = pooh_transform
      .times(Mat4.translation([0, -1.5, 0]))
      .times(Mat4.scale([1.3, 1.5, 1.1]));

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_body,
      this.materials.shirt
    );

    let pooh_left_ear = pooh_transform
      .times(Mat4.translation([-0.8, 0.8, 0]))
      .times(Mat4.scale([0.25, 0.25, 0.1]));

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_left_ear,
      this.materials.fur_color
    );

    let pooh_right_ear = pooh_transform
      .times(Mat4.translation([0.8, 0.8, 0]))
      .times(Mat4.scale([0.25, 0.25, 0.1]));

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_right_ear,
      this.materials.fur_color
    );

    let pooh_right_arm = pooh_transform.copy();

    if (this.current_game_state == this.game_state.started) {
      pooh_right_arm = pooh_right_arm
        .times(Mat4.translation([0.8, -1, -1.1]))
        .times(Mat4.rotation(181, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(190, Vec.of(0, 0, 1)))
        .times(Mat4.scale([0.4, 1.3, 0.4]));
    } else {
      pooh_right_arm = pooh_right_arm
        .times(Mat4.translation([0.8, -1, -1.1]))
        .times(Mat4.rotation(181, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(190, Vec.of(0, 0, 1)))
        .times(Mat4.scale([0.4, 1.3, 0.4]));
    }

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_right_arm,
      this.materials.fur_color
    );

    let pooh_left_arm = pooh_transform.copy();

    if (this.swing_bat) {
      pooh_left_arm = pooh_left_arm
        .times(Mat4.translation([-0.8, -1, -1.1]))
        .times(Mat4.rotation(-181, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(190, Vec.of(0, 0, 1)))
        .times(Mat4.scale([0.4, 1.3, 0.4]));
      // .times(Mat4.rotation(t, [0, 1, 0]));
    } else {
      pooh_left_arm = pooh_left_arm
        .times(Mat4.translation([-0.8, -1, -1.1]))
        .times(Mat4.rotation(-181, Vec.of(0, 1, 0)))
        .times(Mat4.rotation(190, Vec.of(0, 0, 1)))
        .times(Mat4.scale([0.4, 1.3, 0.4]));
    }

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_left_arm,
      this.materials.fur_color
    );

    let pooh_left_leg = pooh_transform
      .times(Mat4.translation([-0.7, -3, 0]))
      .times(Mat4.scale([0.4, 1, 0.4]));

    if (this.swing_bat) {
      pooh_left_leg = pooh_left_leg
        .times(Mat4.translation([1.8, 0, 0]))
        .times(
          Mat4.rotation(0.5 + 0.5 * Math.cos(swing_diff * 9), Vec.of(0, 1, 0))
        )
        .times(Mat4.translation([-1.8, 0, 0]));
    }

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_left_leg,
      this.materials.fur_color
    );

    let pooh_right_leg = pooh_transform
      .times(Mat4.translation([0.7, -3, 0]))
      .times(Mat4.scale([0.4, 1, 0.4]));

    if (this.swing_bat) {
      pooh_right_leg = pooh_right_leg
        .times(Mat4.translation([-1.8, 0, 0]))
        .times(
          Mat4.rotation(0.1 + 0.8 * Math.cos(swing_diff * 8.1), Vec.of(0, 1, 0))
        )
        .times(Mat4.translation([1.8, 0, 0]));
    }

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_right_leg,
      this.materials.fur_color
    );

    let pooh_nose = pooh_transform
      .times(Mat4.translation([0, 0.3, -1.2]))
      .times(Mat4.rotation(3, Vec.of(0, 1, 0)))
      .times(Mat4.rotation(-0.4, Vec.of(1, 0, 0)))
      .times(Mat4.scale([0.5, 0.5, 0.45]));

    this.shapes.rounded_cone.draw(
      context,
      program_state,
      pooh_nose,
      this.materials.fur_color
    );

    let pooh_nose_tip = pooh_transform
      .times(Mat4.translation([0, 0.4, -1.5]))
      .times(Mat4.scale([0.15, 0.15, 0.2]));

    this.shapes.ball_6.draw(
      context,
      program_state,
      pooh_nose_tip,
      this.materials.black
    );

    /******************** pitcher ********************/
    let pitcher_head = mound.copy();

    pitcher_head = pitcher_head
      .times(Mat4.scale([1 / 6, 1 / 3, 1 / 6]))
      .times(Mat4.translation([0, 9.5, 0]))
      .times(Mat4.rotation(15, Vec.of(0, 1, 0)));

    this.shapes.box.draw(
      context,
      program_state,
      pitcher_head,
      this.materials.light_skin
    );

    let face = pitcher_head
      .times(Mat4.translation([-1.7, 1, -0.15]))
      .times(Mat4.scale([2.2, 2.2, 2.2]))
      .times(Mat4.rotation(1, Vec.of(0, 1, 0)));

    this.shapes.plane.draw( 
          context,
          program_state,
          face,
          this.materials.gene
    );

    let pitcher_torso = pitcher_head.copy();

    pitcher_torso = pitcher_torso
      .times(Mat4.translation([0, -2.25, 0]))
      .times(Mat4.scale([1, 1.25, 1]));

    this.shapes.box.draw(
      context,
      program_state,
      pitcher_torso,
      this.materials.shirt
    );

    let pitcher_left_leg = pitcher_torso.copy();

    pitcher_left_leg = pitcher_left_leg
      .times(Mat4.scale([1, 1 / 1.25, 1]))
      .times(Mat4.translation([0, -2.75, -0.5]))
      .times(Mat4.scale([1, 1.5, 0.5]));

    this.shapes.box.draw(
      context,
      program_state,
      pitcher_left_leg,
      this.materials.shirt
    );

    let pitcher_right_leg = pitcher_torso.copy();

    pitcher_right_leg = pitcher_right_leg
      .times(Mat4.scale([1, 1 / 1.25, 1]))
      .times(Mat4.translation([0, -2.75, 0.5]))
      .times(Mat4.scale([1, 1.5, 0.5]));

    this.shapes.box.draw(
      context,
      program_state,
      pitcher_right_leg,
      this.materials.shirt
    );

    let pitcher_left_arm = pitcher_torso.copy();

    pitcher_left_arm = pitcher_left_arm
      .times(Mat4.scale([1, 1, 0.5]))
      .times(Mat4.translation([0, 0, -3]));

    this.shapes.box.draw(
      context,
      program_state,
      pitcher_left_arm,
      this.materials.light_skin
    );

    let pitcher_right_arm = pitcher_torso.copy();

    pitcher_right_arm = pitcher_right_arm
      .times(Mat4.scale([1, 1, 0.5]))
      .times(Mat4.translation([0, 0, 3]));

    this.shapes.box.draw(
      context,
      program_state,
      pitcher_right_arm,
      this.materials.light_skin
    );

    /******************** BAT ********************/

    let bat = pooh_transform.copy();

    if (this.swing_bat && swing_diff >= Math.PI / 4) {
      this.swing_bat = false;
    }

    if (this.swing_bat) {
      // first half of swing
      if (swing_diff < Math.PI / 40) {
        bat = bat
          .times(Mat4.translation([0, -1.2, -2]))
          .times(
            Mat4.rotation(
              -0.62 - 0.5 * Math.cos(swing_diff * 15 + Math.PI),
              Vec.of(1, 0, 0)
            )
          )
          .times(
            Mat4.rotation(-1.9 * Math.cos(swing_diff * 15) + 2, Vec.of(0, 1, 0))
          )
          .times(Mat4.translation([0, 1.5, 2]))
          .times(Mat4.translation([0, 1, -2]))
          .times(Mat4.translation([0, -2.3, 0]))
          .times(Mat4.rotation(0.5, Vec.of(1, 0, 0)))
          .times(Mat4.rotation(-0.3, Vec.of(0, 0, 1)))
          .times(Mat4.translation([0, 2.3, 0]))
          .times(Mat4.scale([2.7, 1.5, 2.7]));
      }
      // second half of swing
      else {
        bat = bat
          .times(Mat4.translation([0, -1.2, -2]))
          .times(Mat4.rotation(-1.12, Vec.of(1, 0, 0)))
          .times(Mat4.rotation(3.9, Vec.of(0, 1, 0)))
          .times(
            Mat4.rotation(
              Math.sin((swing_diff - Math.PI / 12) * 10),
              Vec.of(1, 1, 0)
            )
          )
          .times(Mat4.translation([0, 1.5, 2]))
          .times(Mat4.translation([0, 1, -2]))
          .times(Mat4.translation([0, -2.3, 0]))
          .times(Mat4.rotation(0.5, Vec.of(1, 0, 0)))
          .times(Mat4.rotation(-0.3, Vec.of(0, 0, 1)))
          .times(Mat4.translation([0, 2.3, 0]))
          .times(Mat4.scale([2.7, 1.5, 2.7]));
      }
    } else {
      bat = bat
        .times(Mat4.translation([0, -1.2, -2]))
        .times(Mat4.translation([0, 1.2, 2]))
        .times(Mat4.translation([0, 1, -2]))
        .times(Mat4.translation([0, -2.3, 0]))
        .times(Mat4.rotation(0.5, Vec.of(1, 0, 0)))
        .times(Mat4.rotation(-0.3, Vec.of(0, 0, 1)))
        .times(Mat4.translation([0, 2.3, 0]))
        .times(Mat4.scale([2.7, 1.5, 2.7]));
    }

    this.shapes.bat.draw(context, program_state, bat, this.materials.aluminum);

    /******************** BASEBALL ********************/

    let baseball = pitcher_right_arm.copy();

    // bat
    if (this.bodies.length < 1) {
      this.bodies.push(
        new Body(
          this.shapes.cylinder,
          this.materials.aluminum,
          Vec.of(0.08, 0.08, 0.4)
        ).emplace(
          bat
            .times(Mat4.translation([0, 1, 0]))
            .times(Mat4.rotation(1.5708, Vec.of(1, 0, 0))),
          Vec.of(0, 0, 0),
          0
        )
      );
    }
    // ball
    if (this.pitch_time && this.bodies.length < 2) {
      this.pitch_timer = t;
      this.pitch_time = false;
    }
    if (
      t > this.pitch_timer + 2 &&
      this.bodies.length < 2 &&
      this.pitch_count > -1 &&
      this.current_game_state == this.game_state.started
    ) {
      this.pitch_time = false;
      this.pitch_count = this.pitch_count - 1;
      const speed = getRandomInt(10, 18);
      const xy = getRandomInt(-2, 3) * 0.3;
      this.bodies.push(
        new Body(
          this.shapes.ball_4,
          this.materials.baseball,
          Vec.of(0.5, 0.5, 1)
        ).emplace(
          baseball.times(Mat4.translation([-3, -1, -7])),
          Vec.of(0.4 + xy, 0, speed),
          0
        )
      );
    }

    for (let b of this.bodies) {
      if (b.shape == this.shapes.cylinder) {
        b = b.emplace(
          bat
            .times(Mat4.translation([0, 1, 0]))
            .times(Mat4.rotation(1.5708, Vec.of(1, 0, 0))),
          Vec.of(0, 0, 0),
          0
        );
      }
    }

    ///////////////////* NEW ANIMATION CODE*////////////
    this.simulate(program_state.animation_delta_time);
    // Draw each shape at its current location:
    if (this.current_game_state == this.game_state.started) {
      for (let b of this.bodies) {
        b.shape.draw(context, program_state, b.drawn_location, b.material);
      }
      const { intersect_test, points, leeway } = this.collider;

      if (this.ball_hit) {
        for (let b of this.bodies) {
          if (b.shape == this.shapes.ball_4) {
            this.camera_teleporter.cameras.push(
              Mat4.inverse(
                b.drawn_location
                  .times(Mat4.translation([0, 10, 0]))
                  .times(Mat4.rotation(-Math.PI / 2, Vec.of(0, 1, 0)))
                  .times(Mat4.rotation(-0.55, Vec.of(1, 0, 0)))
                  .times(Mat4.translation([0, 5, 80]))
              )
            );
            this.camera_teleporter.enabled = true;
            this.camera_teleporter.increase();
          }
        }
      }
    }
  }

  update_state(
    dt // update_state(): Your subclass of Simulation has to override this abstract function.
  ) {
    throw "Override this";
  }
}

const Additional_Scenes = [];

export {
  Main_Scene,
  Additional_Scenes,
  Canvas_Widget,
  Code_Widget,
  Text_Widget,
  defs
};

const Camera_Teleporter = (defs.Camera_Teleporter = class Camera_Teleporter extends Scene {
  // **Camera_Teleporter** is a helper Scene meant to be added as a child to
  // your own Scene.  It adds a panel of buttons.  Any matrices externally
  // added to its "this.cameras" can be selected with these buttons. Upon
  // selection, the program_state's camera matrix slowly (smoothly)
  // linearly interpolates itself until it matches the selected matrix.
  constructor() {
    super();
    this.cameras = [];
    this.selection = 0;
  }
  make_control_panel() {
    // make_control_panel(): Sets up a panel of interactive HTML elements, including
    // buttons with key bindings for affecting this scene, and live info readouts.

    this.key_triggered_button("Enable", ["e"], () => (this.enabled = true));
    this.key_triggered_button(
      "Disable",
      ["Shift", "E"],
      () => (this.enabled = false)
    );
    this.new_line();
    this.key_triggered_button("Previous location", ["g"], this.decrease);
    this.key_triggered_button("Next", ["h"], this.increase);
    this.new_line();
    this.live_string(box => {
      box.textContent = "Selected camera location: " + this.selection;
    });
  }
  increase() {
    this.selection = Math.min(
      this.selection + 1,
      Math.max(this.cameras.length - 1, 0)
    );
  }
  decrease() {
    this.selection = Math.max(this.selection - 1, 0);
  } // Don't allow selection of negative indices.
  display(context, program_state) {
    const desired_camera = this.cameras[this.selection];
    if (!desired_camera || !this.enabled) return;
    const dt = program_state.animation_delta_time;
    program_state.set_camera(
      desired_camera.map((x, i) =>
        Vec.from(program_state.camera_inverse[i]).mix(x, 0.01 * dt)
      )
    );
    program_state.projection_transform = Mat4.perspective(
        Math.PI / 4,
        context.width / context.height,
        1,
        2500
      );
  }
});

class Baseball extends Final_Project {
  constructor() {
    super();
  }
  update_state(dt) {
    // update_state():  Override the base time-stepping code to say what this particular
    // scene should do to its bodies every frame -- including applying forces.
    // Generate additional moving bodies if there ever aren't enough:
    if (!this.ball_hit) {
      for (let a of this.bodies) {
        // Cache the inverse of matrix of body "a" to save time.
        a.inverse = Mat4.inverse(a.drawn_location);
        a.material = this.materials.baseball;
        
        for (let b of this.bodies) {
          // Pass the two bodies and the collision shape to check_if_colliding():
          if (!a.check_if_colliding(b, this.collider)) continue;

          this.sounds.crack.play();
          this.ball_hit = true;
          b.angular_velocity = 0;
        }
      }
    }

    if (this.bodies.length > 1) {
      let ball = this.bodies[1];

      /*********THIS IS AFTER THE BALL IS HIT*************/
      if (this.ball_hit) {
        if (ball.linear_velocity[2] > 0) {
          ball.linear_velocity[0] = (ball.center[2] + 1) * 5;
          ball.linear_velocity[1] += Math.floor(Math.random() * 21) + 10; //goes airborne!
          ball.linear_velocity[2] *= -Math.min(
            3.6,
            Math.abs(ball.center[2]) * 3
          );
        }

        ball.linear_velocity[1] += dt * -9.8;
        // If about to fall through floor, reverse y velocity:
        if (ball.center[1] < -9.7 && ball.linear_velocity[1] < 0) {
          if (!this.ball_bounced) {
            this.ball_bounced = true;
            let x = ball.center[0];
            let z = ball.center[2];
            if (Math.abs(x) < 150 && Math.abs(z) > 160 - Math.abs(x)) {
              //HOMERUN
              this.game_score++;
              this.sounds.homerun.play();
            } else {
              //NOT HOMERUN
              this.sounds.no_homerun.play();
            }
          }
          ball.linear_velocity[0] *= 0.6;
          ball.linear_velocity[1] *= -0.6;
          ball.linear_velocity[2] *= 0.6;
          ball.angular_velocity *= 0.5;
        }

        if (ball.linear_velocity.norm() < 2 && ball.center[1] < -9.7)
          ball.linear_velocity[1] = 0;
      }

      if (this.ball_hit) {
        this.bodies = this.bodies.filter(b => {
          if (b.center.norm() < 300) {
            this.pitch_time = true;
          }
          return b.center.norm() < 300;
        });
        for (let b of this.bodies) {
          if (b.center.norm() < 90) this.camera_teleporter.decrease();
        }
      } else {
        this.bodies = this.bodies.filter(b => b.center.norm() < 40);
      }

      if (this.bodies.length < 2) {
        this.ball_hit = false;
        this.ball_bounced = false;
      } else {
        if (ball.linear_velocity.every(v => Math.abs(v) < 0.5)) {
          this.ball_hit = false;
          this.ball_bounced = false;
          this.bodies.pop();
        }
      }
    }

    // if (b.linear_velocity[1] == 0) this.bodies.pop();
    // Delete bodies that stop or stray too far away:
  }
}

const Main_Scene = Baseball;
