#!/usr/bin/env python3
"""
VIDEO-TELEPORT: Detect camera teleports/jumps in recorded demo videos.

Extracts frames, computes frame-to-frame visual difference (structural),
and flags any jump exceeding a configurable threshold.

Usage:
    python detect_teleport.py <video.mp4> [--threshold 15] [--skip-first 2] [--output report.json]

Exit codes:
    0 = PASS (no teleports detected)
    1 = FAIL (teleports detected)
    2 = ERROR (bad input, ffmpeg missing, etc.)
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

def extract_frames(video_path: str, out_dir: str, fps: int = 30) -> list[str]:
    """Extract all frames as JPEG files."""
    pattern = os.path.join(out_dir, "frame_%05d.jpg")
    cmd = [
        "ffmpeg", "-i", video_path,
        "-vf", f"fps={fps}",
        "-q:v", "2",
        pattern,
        "-y", "-loglevel", "error"
    ]
    subprocess.run(cmd, check=True)
    frames = sorted(Path(out_dir).glob("frame_*.jpg"))
    return [str(f) for f in frames]


def compute_diff(frame_a: str, frame_b: str) -> float:
    """
    Compute mean absolute pixel difference between two frames.
    Uses ffmpeg lavfi to avoid numpy/opencv dependency.
    Returns a value 0-255 (0 = identical, 255 = completely different).
    """
    cmd = [
        "ffmpeg",
        "-i", frame_a,
        "-i", frame_b,
        "-filter_complex",
        "[0:v][1:v]blend=all_mode=difference,blackframe=amount=0:threshold=0",
        "-f", "null", "-",
        "-loglevel", "info"
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    # Parse blackframe output for mean pixel value
    # Fallback: use pixel comparison via Python
    return _pixel_diff(frame_a, frame_b)


def _pixel_diff(frame_a: str, frame_b: str) -> float:
    """Compute mean absolute difference using raw pixel comparison via ffmpeg."""
    # Extract raw RGB from both frames at reduced resolution for speed
    def get_pixels(path: str) -> bytes:
        cmd = [
            "ffmpeg", "-i", path,
            "-vf", "scale=320:180",
            "-f", "rawvideo", "-pix_fmt", "rgb24",
            "-loglevel", "error",
            "pipe:1"
        ]
        result = subprocess.run(cmd, capture_output=True)
        return result.stdout

    pix_a = get_pixels(frame_a)
    pix_b = get_pixels(frame_b)

    if len(pix_a) != len(pix_b) or len(pix_a) == 0:
        return 255.0  # Can't compare, flag as suspicious

    total_diff = 0
    for a, b in zip(pix_a, pix_b):
        total_diff += abs(a - b)

    return total_diff / len(pix_a)


def analyze_video(video_path: str, threshold: float = 15.0, skip_first: float = 0.0,
                  fps: int = 30) -> dict:
    """
    Analyze a video for camera teleports.

    Args:
        video_path: Path to the video file
        threshold: Mean pixel diff above which a frame pair is flagged as a teleport
        skip_first: Skip the first N seconds (setup/overlay time)
        fps: Frames per second to extract

    Returns:
        Report dict with frame-by-frame diffs and flagged teleports
    """
    if not os.path.exists(video_path):
        return {"error": f"Video not found: {video_path}"}

    with tempfile.TemporaryDirectory(prefix="teleport_") as tmp_dir:
        print(f"Extracting frames at {fps}fps...")
        frames = extract_frames(video_path, tmp_dir, fps)
        print(f"Extracted {len(frames)} frames")

        if len(frames) < 2:
            return {"error": "Not enough frames to analyze"}

        skip_frames = int(skip_first * fps)
        diffs = []
        teleports = []

        for i in range(max(1, skip_frames), len(frames)):
            diff = _pixel_diff(frames[i - 1], frames[i])
            time_sec = i / fps
            entry = {
                "frame": i,
                "time": round(time_sec, 3),
                "diff": round(diff, 2),
                "prev_frame": i - 1
            }
            diffs.append(entry)

            if diff > threshold:
                teleports.append(entry)
                print(f"  TELEPORT @ frame {i} (t={time_sec:.2f}s): diff={diff:.1f} > {threshold}")

        # Smoothness rule: detect spikes > 2x the 5-frame rolling average
        smoothness_violations = []
        WINDOW = 5
        SPIKE_FACTOR = 2.0
        for i in range(WINDOW, len(diffs)):
            window_avg = sum(d["diff"] for d in diffs[i - WINDOW:i]) / WINDOW
            current = diffs[i]["diff"]
            if window_avg > 0 and current > window_avg * SPIKE_FACTOR and current > 5.0:
                smoothness_violations.append({
                    **diffs[i],
                    "rolling_avg": round(window_avg, 2),
                    "spike_ratio": round(current / window_avg, 2),
                })
                print(f"  SPIKE @ frame {diffs[i]['frame']} (t={diffs[i]['time']}s): "
                      f"diff={current:.1f}, rolling_avg={window_avg:.1f}, "
                      f"ratio={current/window_avg:.1f}x")

        # Compute stats
        diff_values = [d["diff"] for d in diffs]
        avg_diff = sum(diff_values) / len(diff_values) if diff_values else 0
        max_diff = max(diff_values) if diff_values else 0
        min_diff = min(diff_values) if diff_values else 0

        # Find the smoothest and roughest transitions
        sorted_diffs = sorted(diffs, key=lambda d: d["diff"], reverse=True)
        top5_roughest = sorted_diffs[:5]

        report = {
            "video": os.path.basename(video_path),
            "total_frames": len(frames),
            "analyzed_frames": len(diffs),
            "skip_first_seconds": skip_first,
            "threshold": threshold,
            "stats": {
                "avg_diff": round(avg_diff, 2),
                "max_diff": round(max_diff, 2),
                "min_diff": round(min_diff, 2),
            },
            "teleports_detected": len(teleports),
            "teleports": teleports,
            "smoothness_violations": len(smoothness_violations),
            "spikes": smoothness_violations,
            "top5_roughest": top5_roughest,
            "verdict": "PASS" if len(teleports) == 0 and len(smoothness_violations) == 0 else "FAIL",
        }

        return report


def main():
    parser = argparse.ArgumentParser(description="Detect camera teleports in demo videos")
    parser.add_argument("video", help="Path to the video file")
    parser.add_argument("--threshold", type=float, default=15.0,
                        help="Pixel diff threshold for teleport detection (default: 15)")
    parser.add_argument("--skip-first", type=float, default=0.0,
                        help="Skip first N seconds of the video")
    parser.add_argument("--fps", type=int, default=10,
                        help="FPS for frame extraction (lower = faster, default: 10)")
    parser.add_argument("--output", type=str, default=None,
                        help="Write JSON report to this file")
    args = parser.parse_args()

    report = analyze_video(args.video, args.threshold, args.skip_first, args.fps)

    if "error" in report:
        print(f"ERROR: {report['error']}")
        sys.exit(2)

    # Print summary
    print(f"\n{'='*50}")
    print(f"VIDEO: {report['video']}")
    print(f"FRAMES: {report['total_frames']} total, {report['analyzed_frames']} analyzed")
    print(f"STATS: avg={report['stats']['avg_diff']}, max={report['stats']['max_diff']}, min={report['stats']['min_diff']}")
    print(f"THRESHOLD: {report['threshold']}")
    print(f"TELEPORTS: {report['teleports_detected']}")
    print(f"SMOOTHNESS SPIKES: {report['smoothness_violations']}")
    print(f"VERDICT: {report['verdict']}")
    print(f"{'='*50}")

    if report["top5_roughest"]:
        print("\nTop 5 roughest transitions:")
        for t in report["top5_roughest"]:
            flag = " *** TELEPORT" if t["diff"] > args.threshold else ""
            print(f"  Frame {t['frame']} (t={t['time']}s): diff={t['diff']}{flag}")

    if report["spikes"]:
        print("\nSmoothness violations (>2x rolling avg):")
        for s in report["spikes"]:
            print(f"  Frame {s['frame']} (t={s['time']}s): diff={s['diff']}, "
                  f"rolling_avg={s['rolling_avg']}, spike={s['spike_ratio']}x")

    if args.output:
        with open(args.output, "w") as f:
            json.dump(report, f, indent=2)
        print(f"\nReport saved to: {args.output}")

    sys.exit(0 if report["verdict"] == "PASS" else 1)


if __name__ == "__main__":
    main()
