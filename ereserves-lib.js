// ==UserScript==
// @name         Tsinghua E-Reserves Lib Downloader
// @namespace    anyi.fan
// @version      0.1.1
// @license      GPL-3.0 License
// @description  Download PDF from Tsinghua University Electronic Course Reserves Service Platform
// @author       A1phaN
// @match        https://ereserves.lib.tsinghua.edu.cn/readkernel/ReadJPG/JPGJsNetPage/*
// @grant        none
// ==/UserScript==

const MAX_RETRY = 10;
const QUERY_INTERVAL = 100;

const sleep = time => new Promise(res => setTimeout(res, time));
const getImage = async (url, retry = MAX_RETRY) => {
  const img = new Image();
  img.src = url;
  img.style.display = 'none';
  const data = new Promise((res, rej) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')?.drawImage(img, 0, 0, img.width, img.height);
      res([img, canvas.toDataURL('image/jpeg')]);
    };
    img.onerror = err => {
      retry > 0 ? res(getImage(url, retry - 1)) : rej(err);
    };
  });
  document.body.appendChild(img);
  return data;
};

(async () => {
  const scanId = document.querySelector('#scanid')?.value;
  const bookId = location.href.split('/').at(-1);
  const bookNameElement = document.querySelector('#p_bookname');
  const bookName = bookNameElement.innerText;
  const BotuReadKernel = document.cookie.split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('BotuReadKernel='))
    ?.split('=')[1];
  if (!scanId || !BotuReadKernel || !bookName) return;

  await new Promise(res => {
    if (window.jspdf) return res();
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    script.onload = res;
    document.body.appendChild(script);
  });
  if (!window.jspdf) return;

  const button = document.createElement('span');
  button.className = 'fucBtn icon iconfont';
  button.style = 'margin-left: 8px; position: relative; top: 2px;';
  button.innerHTML =
  `<svg
    t="1703917701009"
    viewBox="0 0 1024 1024"
    version="1.1"
    xmlns="http://www.w3.org/2000/svg"
    p-id="5061"
    height="2rem"
  >
    <path
      d="M896 672c-17.066667 0-32 14.933333-32 32v128c0 6.4-4.266667 10.666667-10.666667 10.666667H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667v-128c0-17.066667-14.933333-32-32-32s-32 14.933333-32 32v128c0 40.533333 34.133333 74.666667 74.666667 74.666667h682.666666c40.533333 0 74.666667-34.133333 74.666667-74.666667v-128c0-17.066667-14.933333-32-32-32z"
      fill="#ddd"
      p-id="5062"
    ></path>
    <path
      d="M488.533333 727.466667c6.4 6.4 14.933333 8.533333 23.466667 8.533333s17.066667-2.133333 23.466667-8.533333l213.333333-213.333334c12.8-12.8 12.8-32 0-44.8-12.8-12.8-32-12.8-44.8 0l-157.866667 157.866667V170.666667c0-17.066667-14.933333-32-32-32s-34.133333 14.933333-34.133333 32v456.533333L322.133333 469.333333c-12.8-12.8-32-12.8-44.8 0-12.8 12.8-12.8 32 0 44.8l211.2 213.333334z"
      fill="#ddd"
      p-id="5063"
    ></path>
  </svg>`;
  document.querySelector('.option-list').appendChild(button);

  const downloadPDF = async () => {
    try {
      button.onclick = null;
      let doc = null;
      const chapters = await (
        await fetch(
          '/readkernel/KernelAPI/BookInfo/selectJgpBookChapters',
          {
            body: `SCANID=${scanId}`,
            headers: {
              Botureadkernel: BotuReadKernel,
              'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            },
            method: 'POST',
          },
        )
      ).json();
      if (chapters.code !== 1 || !Array.isArray(chapters.data)) {
        alert('Get chapters data failed!');
        return;
      }

      for (let chap = 0; chap < chapters.data.length; ++chap) {
        bookNameElement.innerText = `${bookName}（正在获取第 ${chap + 1} 章...）`;
        const chapter = chapters.data[chap];
        const chapterData = await (
          await fetch(
            '/readkernel/KernelAPI/BookInfo/selectJgpBookChapter',
            {
              body: `EMID=${chapter.EMID}&BOOKID=${bookId}`,
              headers: {
                Botureadkernel: BotuReadKernel,
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
              },
              method: 'POST',
            },
          )
        ).json();
        if (chapterData.code !== 1 || !Array.isArray(chapterData.data.JGPS)) {
          alert(`Get chapter ${chap + 1} ${chapter.EFRAGMENTNAME} data failed!`);
          return;
        }

        for (let i = 0; i < chapterData.data.JGPS.length; ++i) {
          const jpg = chapterData.data.JGPS[i];
          try {
            const [img, dataURL] = await getImage(`/readkernel/JPGFile/DownJPGJsNetPage/${jpg.hfsKey}`);
            if (!doc) {
              doc = new jspdf.jsPDF({ format: [img.width, img.height], unit: 'px' });
            } else {
              doc.addPage([img.width, img.height]);
            }
            doc.addImage(dataURL, 'JPEG', 0, 0, img.width, img.height);
            bookNameElement.innerText = `${bookName}（正在获取第 ${chap + 1} 章，已完成: ${i + 1} / ${chapterData.data.JGPS.length}）`;
            await sleep(QUERY_INTERVAL);
          } catch(e) {
            alert(`Get page ${i + 1} of chapter ${chap + 1} ${chapter.EFRAGMENTNAME} failed!`);
            return;
          }
        }
      }
      doc && doc.save(`${bookName}.pdf`);
      bookNameElement.innerText = `${bookName}（下载完成）`;
    } finally {
      button.onclick = downloadPDF;
    }
  };
  button.onclick = downloadPDF;
})();