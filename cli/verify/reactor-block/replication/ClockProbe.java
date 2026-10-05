/**
 * Replication, instrument change 4: clock preflight (informational, decides nothing).
 * Samples the wall clock (currentTimeMillis) against the monotonic clock (nanoTime) every
 * 100 ms for the given seconds and prints every step of the wall clock > 20 ms.
 */
public class ClockProbe {
    public static void main(String[] args) throws Exception {
        int seconds = Integer.parseInt(args[0]);
        long n0 = System.nanoTime(), w0 = System.currentTimeMillis();
        double prev = 0;
        int steps = 0;
        for (int i = 1; i <= seconds * 10; i++) {
            Thread.sleep(100);
            double mono = (System.nanoTime() - n0) / 1e6, d = (System.currentTimeMillis() - w0) - mono;
            if (Math.abs(d - prev) > 20) {
                System.out.printf("clock_step at_s=%.1f step_ms=%.0f%n", mono / 1000, d - prev);
                steps++;
            }
            prev = d;
        }
        System.out.printf("clock_preflight seconds=%d steps=%d wall_minus_monotonic_ms=%.0f%n", seconds, steps, prev);
    }
}
