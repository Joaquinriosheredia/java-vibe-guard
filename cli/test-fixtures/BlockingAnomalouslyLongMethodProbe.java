package com.example;

import org.springframework.scheduling.annotation.Scheduled;

// A3.2 regression fixture — case (e): the real method body legitimately
// exceeds the 60-line safety cap. Documents the explicit design decision
// (point 2.e): the cap is NOT eliminated by A3.2, it is kept as a bound on
// how far extractMethodBodyRange() searches for the real closing brace —
// once a method genuinely exceeds it, the scan is best-effort and a blocking
// call past the cap is not detected. This is an accepted, documented
// limitation (a method this long is already a code smell), not a bug.
public class BlockingAnomalouslyLongMethodProbe {
    @Scheduled(fixedDelay = 1000)
    public void runAnomalouslyLongJob() throws InterruptedException {
        int padding1 = 1; // padding line 1 of 65 — pushes the body past the 60-line cap
        int padding2 = 2; // padding line 2 of 65 — pushes the body past the 60-line cap
        int padding3 = 3; // padding line 3 of 65 — pushes the body past the 60-line cap
        int padding4 = 4; // padding line 4 of 65 — pushes the body past the 60-line cap
        int padding5 = 5; // padding line 5 of 65 — pushes the body past the 60-line cap
        int padding6 = 6; // padding line 6 of 65 — pushes the body past the 60-line cap
        int padding7 = 7; // padding line 7 of 65 — pushes the body past the 60-line cap
        int padding8 = 8; // padding line 8 of 65 — pushes the body past the 60-line cap
        int padding9 = 9; // padding line 9 of 65 — pushes the body past the 60-line cap
        int padding10 = 10; // padding line 10 of 65 — pushes the body past the 60-line cap
        int padding11 = 11; // padding line 11 of 65 — pushes the body past the 60-line cap
        int padding12 = 12; // padding line 12 of 65 — pushes the body past the 60-line cap
        int padding13 = 13; // padding line 13 of 65 — pushes the body past the 60-line cap
        int padding14 = 14; // padding line 14 of 65 — pushes the body past the 60-line cap
        int padding15 = 15; // padding line 15 of 65 — pushes the body past the 60-line cap
        int padding16 = 16; // padding line 16 of 65 — pushes the body past the 60-line cap
        int padding17 = 17; // padding line 17 of 65 — pushes the body past the 60-line cap
        int padding18 = 18; // padding line 18 of 65 — pushes the body past the 60-line cap
        int padding19 = 19; // padding line 19 of 65 — pushes the body past the 60-line cap
        int padding20 = 20; // padding line 20 of 65 — pushes the body past the 60-line cap
        int padding21 = 21; // padding line 21 of 65 — pushes the body past the 60-line cap
        int padding22 = 22; // padding line 22 of 65 — pushes the body past the 60-line cap
        int padding23 = 23; // padding line 23 of 65 — pushes the body past the 60-line cap
        int padding24 = 24; // padding line 24 of 65 — pushes the body past the 60-line cap
        int padding25 = 25; // padding line 25 of 65 — pushes the body past the 60-line cap
        int padding26 = 26; // padding line 26 of 65 — pushes the body past the 60-line cap
        int padding27 = 27; // padding line 27 of 65 — pushes the body past the 60-line cap
        int padding28 = 28; // padding line 28 of 65 — pushes the body past the 60-line cap
        int padding29 = 29; // padding line 29 of 65 — pushes the body past the 60-line cap
        int padding30 = 30; // padding line 30 of 65 — pushes the body past the 60-line cap
        int padding31 = 31; // padding line 31 of 65 — pushes the body past the 60-line cap
        int padding32 = 32; // padding line 32 of 65 — pushes the body past the 60-line cap
        int padding33 = 33; // padding line 33 of 65 — pushes the body past the 60-line cap
        int padding34 = 34; // padding line 34 of 65 — pushes the body past the 60-line cap
        int padding35 = 35; // padding line 35 of 65 — pushes the body past the 60-line cap
        int padding36 = 36; // padding line 36 of 65 — pushes the body past the 60-line cap
        int padding37 = 37; // padding line 37 of 65 — pushes the body past the 60-line cap
        int padding38 = 38; // padding line 38 of 65 — pushes the body past the 60-line cap
        int padding39 = 39; // padding line 39 of 65 — pushes the body past the 60-line cap
        int padding40 = 40; // padding line 40 of 65 — pushes the body past the 60-line cap
        int padding41 = 41; // padding line 41 of 65 — pushes the body past the 60-line cap
        int padding42 = 42; // padding line 42 of 65 — pushes the body past the 60-line cap
        int padding43 = 43; // padding line 43 of 65 — pushes the body past the 60-line cap
        int padding44 = 44; // padding line 44 of 65 — pushes the body past the 60-line cap
        int padding45 = 45; // padding line 45 of 65 — pushes the body past the 60-line cap
        int padding46 = 46; // padding line 46 of 65 — pushes the body past the 60-line cap
        int padding47 = 47; // padding line 47 of 65 — pushes the body past the 60-line cap
        int padding48 = 48; // padding line 48 of 65 — pushes the body past the 60-line cap
        int padding49 = 49; // padding line 49 of 65 — pushes the body past the 60-line cap
        int padding50 = 50; // padding line 50 of 65 — pushes the body past the 60-line cap
        int padding51 = 51; // padding line 51 of 65 — pushes the body past the 60-line cap
        int padding52 = 52; // padding line 52 of 65 — pushes the body past the 60-line cap
        int padding53 = 53; // padding line 53 of 65 — pushes the body past the 60-line cap
        int padding54 = 54; // padding line 54 of 65 — pushes the body past the 60-line cap
        int padding55 = 55; // padding line 55 of 65 — pushes the body past the 60-line cap
        int padding56 = 56; // padding line 56 of 65 — pushes the body past the 60-line cap
        int padding57 = 57; // padding line 57 of 65 — pushes the body past the 60-line cap
        int padding58 = 58; // padding line 58 of 65 — pushes the body past the 60-line cap
        int padding59 = 59; // padding line 59 of 65 — pushes the body past the 60-line cap
        int padding60 = 60; // padding line 60 of 65 — pushes the body past the 60-line cap
        int padding61 = 61; // padding line 61 of 65 — pushes the body past the 60-line cap
        int padding62 = 62; // padding line 62 of 65 — pushes the body past the 60-line cap
        int padding63 = 63; // padding line 63 of 65 — pushes the body past the 60-line cap
        int padding64 = 64; // padding line 64 of 65 — pushes the body past the 60-line cap
        int padding65 = 65; // padding line 65 of 65 — pushes the body past the 60-line cap
        Thread.sleep(999); // NOT detected: beyond the 60-line safety cap — accepted, documented limitation (2.e)
    }
}
