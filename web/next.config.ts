import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/experiment-lab/:frame(\\d{2})",
        destination: "/exp-lab/demo.studio/20260517_DEMO00001.mp4/frames/:frame",
        permanent: false,
      },
      {
        source: "/media/experiment-lab/:frame(\\d{2})/:variant(thumb|full)",
        destination: "/media/exp-lab/demo.studio/20260517_DEMO00001.mp4/:frame/:variant",
        permanent: false,
      },
      {
        source: "/experiment-lab/:path*",
        destination: "/exp-lab/:path*",
        permanent: false,
      },
      {
        source: "/media/experiment-lab/:path*",
        destination: "/media/exp-lab/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
