export interface HoleData {
  hole: number;
  par: number;
  si: number;
  yardage: number;
}

export interface CourseData {
  name: string;
  front9: HoleData[];
  back9: HoleData[];
}

export const COURSES: Record<string, CourseData> = {
  SOUTH: {
    name: "Torrey Pines South",
    front9: [
      { hole: 1,  par: 4, si: 3,  yardage: 452 },
      { hole: 2,  par: 4, si: 11, yardage: 389 },
      { hole: 3,  par: 3, si: 15, yardage: 196 },
      { hole: 4,  par: 4, si: 5,  yardage: 490 },
      { hole: 5,  par: 4, si: 9,  yardage: 453 },
      { hole: 6,  par: 5, si: 1,  yardage: 531 },
      { hole: 7,  par: 4, si: 13, yardage: 454 },
      { hole: 8,  par: 3, si: 17, yardage: 175 },
      { hole: 9,  par: 5, si: 7,  yardage: 568 },
    ],
    back9: [
      { hole: 10, par: 4, si: 8,  yardage: 408 },
      { hole: 11, par: 3, si: 14, yardage: 221 },
      { hole: 12, par: 4, si: 2,  yardage: 504 },
      { hole: 13, par: 5, si: 6,  yardage: 570 },
      { hole: 14, par: 4, si: 12, yardage: 452 },
      { hole: 15, par: 4, si: 16, yardage: 438 },
      { hole: 16, par: 3, si: 10, yardage: 231 },
      { hole: 17, par: 4, si: 4,  yardage: 498 },
      { hole: 18, par: 5, si: 18, yardage: 570 },
    ],
  },
  NORTH: {
    name: "Torrey Pines North",
    front9: [
      { hole: 1,  par: 5, si: 7,  yardage: 521 },
      { hole: 2,  par: 4, si: 15, yardage: 389 },
      { hole: 3,  par: 3, si: 17, yardage: 150 },
      { hole: 4,  par: 4, si: 3,  yardage: 421 },
      { hole: 5,  par: 4, si: 9,  yardage: 405 },
      { hole: 6,  par: 3, si: 13, yardage: 188 },
      { hole: 7,  par: 4, si: 5,  yardage: 433 },
      { hole: 8,  par: 4, si: 1,  yardage: 448 },
      { hole: 9,  par: 5, si: 11, yardage: 522 },
    ],
    back9: [
      { hole: 10, par: 4, si: 6,  yardage: 417 },
      { hole: 11, par: 4, si: 2,  yardage: 431 },
      { hole: 12, par: 3, si: 10, yardage: 176 },
      { hole: 13, par: 4, si: 4,  yardage: 409 },
      { hole: 14, par: 5, si: 14, yardage: 544 },
      { hole: 15, par: 4, si: 8,  yardage: 397 },
      { hole: 16, par: 4, si: 18, yardage: 395 },
      { hole: 17, par: 3, si: 12, yardage: 173 },
      { hole: 18, par: 5, si: 16, yardage: 525 },
    ],
  },
};