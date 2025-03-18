/*
 * Copyright © HatioLab Inc. All rights reserved.
 */

import { Rotation } from "./rotation";
import { Vibration } from "./vibration";
import { Heartbeat } from "./heartbeat";
import { Moving } from "./moving";
import { Fade } from "./fade";

import { register } from "../core/compile";

register("rotation", Rotation);
register("vibration", Vibration);
register("heartbeat", Heartbeat);
register("moving", Moving);
register("fade", Fade);
