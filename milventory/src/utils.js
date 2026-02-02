// Utility functions and constants
export const POOL = [
  "NEMA17 stepper motors","metal gear servos","brushless ESCs","PWM fan modules",
  "Arduino Nano boards","Teensy 4.1","Raspberry Pi 4","Jetson Nano heatsink",
  "LiPo 3S packs","LiFePO4 cells","XT60 connectors","balance chargers",
  "buck converters","MOSFET driver boards","relay modules","optocouplers",
  "ultrasonic HC-SR04","VL53L0X ToF sensors","bno055 IMU","9-axis IMU",
  "AS5600 encoders","optical encoders","hall effect sensors","limit switches",
  "HS-311 servos","SG90 micro servos","MG996R servo horns","servo extension leads",
  "GT2 belts","60T/20T pulleys","planetary gearboxes","shaft couplers",
  "608ZZ bearings","idler pulleys","linear rails MGN12","lead screws T8",
  "M3 socket screws","M4 nyloc nuts","brass heat inserts","standoffs assortment",
  "aluminum extrusion 2020","corner brackets","t-nuts and bolts","L-brackets",
  "breadboards","jumper wires","Dupont housings","crimp terminals",
  "soldering tips","flux pens","Kapton tape","heat-shrink tubing",
  "zip ties","Velcro straps","PTFE tube","silicone wire 18AWG",
  "OpenCV calibration targets","AprilTags","ArUco markers","LED ring lights",
  "I2C cables","CAN transceivers","RS-485 adapters","UART-USB bridges",
  "pneumatic solenoids","push-to-connect fittings","polyurethane tubing","mini air pump",
  "odometry wheels","omni wheels"," mecanum wheels","urethane rollers",
  "grease & Loctite","thermal pads","spare nozzles","3D printer filament PETG",
  "datasheets & wiring diagrams","maintenance logs","purchase orders","test reports"
];

export const WORKBENCH_ITEMS = [
  "ESD mat & wrist strap","hot air rework station","fine-tip soldering iron",
  "PCB vise & magnifier lamp","smoke absorber fan","bin of spare 0603 passives",
  "oscilloscope probes & logic analyzer","calipers & torque screwdriver"
];

export function sample(arr, k) {
  const copy = [...arr];
  const out = [];
  while (k-- && copy.length) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i,1)[0]);
  }
  return out;
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

