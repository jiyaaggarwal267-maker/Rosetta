import React from "react";
import { Composition } from "remotion";
import { T } from "./theme";
import { Trailer } from "./Trailer";

export const Root: React.FC = () => (
  <Composition id="RosettaTrailer" component={Trailer} durationInFrames={T.frames} fps={T.fps} width={1920} height={1080} />
);
