import { memo } from "react";
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";
import { DivProps } from "react-html-props";

// ----------------------------------------------------------------------

// export const StyledRootScrollbar = styled("div")(() => ({
//   flexGrow: 1,
//   height: "100%",
//   overflow: "hidden"
// }));

// export const StyledScrollbar = styled(SimpleBar)(
//   ({ theme }: { theme: Theme }) => ({
//     maxHeight: "100%",
//     "& .simplebar-scrollbar": {
//       "&:before": {
//         backgroundColor: alpha(theme.palette.grey[600], 0.48)
//       },
//       "&.simplebar-visible:before": {
//         opacity: 1
//       }
//     },
//     "& .simplebar-mask": {
//       zIndex: "inherit"
//     }
//   })
// );

// ----------------------------------------------------------------------

const Scrollbar = ({ children, style, ref, ...other }: DivProps) => {
  const userAgent =
    typeof navigator === "undefined" ? "SSR" : navigator.userAgent;

  const mobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      userAgent
    );

  if (mobile) {
    return (
      <div ref={ref} {...other} style={{ ...style, overflow: "auto" }}>
        {children}
      </div>
    );
  }

  return (
    <div className="grow h-full overflow-hidden">
      <SimpleBar
        scrollableNodeProps={{
          ref
        }}
        clickOnTrack={false}
        {...other}
        style={style}
        className="max-h-full [&.simplebar-scrollbar]:[&:before]:bg-gray-400 [&.simplebar-scrollbar]:[&.simplebar-visible:before]:opacity-100 [&.simplebar-mask]:z-[inherit]"
      >
        {children}
      </SimpleBar>
    </div>
  );
};
// );

export default memo(Scrollbar);
