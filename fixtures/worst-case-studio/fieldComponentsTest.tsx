import {styled} from 'styled-components'

const CustomBox = styled.div`
  animation: 3s linear 0s infinite normal none spin;
  background: white;
  border: 1px solid black;
  cursor: pointer;
  height: 40px;
  width: 40px;
  &:hover {
    background: red;
  }
  @keyframes spin {
    from {
      transform: rotate(0);
    }
    to {
      transform: rotate(180deg);
    }
  }
`

export default {
  fields: [
    {
      description: <span style={{textDecoration: 'line-through'}}>Title description</span>,
      name: 'title',
      title: <em style={{textDecoration: 'underline'}}>Title</em>,
      type: 'string',
    },
    {
      description: (
        <div>
          <div>Image description 📷</div>
          <div style={{display: 'inline-block', padding: '2em'}}>
            <a href="https://www.sanity.io" rel="noopener noreferrer" target="_blank">
              <CustomBox />
            </a>
          </div>
        </div>
      ),
      name: 'image',
      title: <span>Image 🖼️</span>,
      type: 'image',
    },
    {
      description: (
        <span>
          Subtitle description <span style={{color: 'red'}}>x ← x - (JᵀJ + λIₙ༝ₙ)⁻¹ Jᵀr</span>
          <script>window.alert('👻')</script>
        </span>
      ),
      name: 'subtitle',
      title: (
        <div>
          <h1 style={{fontWeight: 'bold'}}>Subtitle (h1)</h1>
          <h2>Subtitle (h2)</h2>
          <h3>Subtitle (h3)</h3>
        </div>
      ),
      type: 'string',
    },
  ],
  name: 'fieldComponentsTest',
  preview: {
    prepare({media, title}: any) {
      return {
        media,
        subtitle: 'example subtitle',
        title: title,
      }
    },
    select: {
      media: 'image',
      title: 'title',
    },
  },
  title: 'Fields with React components',
  type: 'document',
}
