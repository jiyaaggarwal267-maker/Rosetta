import React from "react";
import { AbsoluteFill, Audio, Sequence, getStaticFiles, staticFile, useCurrentFrame } from "remotion";
import { ease, prog } from "./anim";
import { loadFonts } from "./fonts";
import { Grain, Letterbox, Vignette } from "./fx";
import { S1Signal } from "./scenes/S1Signal";
import { S2Breakdown } from "./scenes/S2Breakdown";
import { S3Reveal } from "./scenes/S3Reveal";
import { S4Six } from "./scenes/S4Six";
import { S5Beyond } from "./scenes/S5Beyond";
import { S6Impact } from "./scenes/S6Impact";
import { S7Final } from "./scenes/S7Final";
import { C, T } from "./theme";

loadFonts();

const SCENES: [keyof typeof T.scenes, React.FC][] = [
  ["signal", S1Signal],
  ["breakdown", S2Breakdown],
  ["reveal", S3Reveal],
  ["six", S4Six],
  ["beyond", S5Beyond],
  ["impact", S6Impact],
  ["final", S7Final],
];

const hasAudio = () => getStaticFiles().some((f) => f.name === "audio/soundtrack.wav");

export const Trailer: React.FC = () => {
  const frame = useCurrentFrame();
  // 2.39:1 bars through the tense first act; they open on the reveal.
  const bars = prog(frame, T.s3.reveal, T.s3.reveal + 30, ease.inOut);
  return (
    <AbsoluteFill style={{ background: C.void }}>
      {SCENES.map(([key, Scene]) => {
        const [from, to] = T.scenes[key];
        return (
          <Sequence key={key} from={from} durationInFrames={to - from} name={key}>
            <Scene />
          </Sequence>
        );
      })}
      <Vignette strength={0.7} />
      <Grain opacity={0.11} />
      <Letterbox open={bars} />
      {hasAudio() && <Audio src={staticFile("audio/soundtrack.wav")} />}
    </AbsoluteFill>
  );
};
